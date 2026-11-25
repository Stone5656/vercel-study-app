# リアルタイムチャット 要件定義書（確定案）

## 1. 前提・確定値

教材の正式 WISH 原本は未取得である。`WISH-CHAT-001〜005` は今回の依頼に対する暫定分類であり、教材の正式IDとして扱わない。以下は今回の実装で確定したスコープである。

- 単一ルーム `lobby`、全インスタンス合計5 Socket接続。tabは接続ごとに別席。
- username: trim後1〜30 Unicodeコードポイント。comment: trim後1〜2,000 Unicodeコードポイント。
- display nameは認証/認可情報でない。ログインなし。
- 投稿IDはPostgreSQL BIGINT、wire DTO上は10進文字列。
- 最新20件を取得し、画面では古い順に表示。
- Postgres Adapterをインスタンス間配信に用い、Neon/PostgreSQLで共有seatを原子的管理。
- Socket.IO transportはWebSocket専用。公開環境は明示的に許可されない限り停止。
- 実NeonとVercelでの適合性は未検証。実機で成功と報告しない。

## 2. 機能要件・受入条件

| REQ          | 要件・確認可能な受入条件                                                                                                                                                                         | WISH        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| REQ-CHAT-001 | `GET /chat` がRouter→Controller→EJS renderを通り `views/chat/index.ejs` を表示する。TOPリンク、状態/履歴表示を持つ。資産は `public/chat/chat.js`, `chat.css`                                     | 001         |
| REQ-CHAT-002 | `chat:join({username})` はtrim後1〜30 code pointsのみ受理。型違い/空白/境界外は安全なvalidation ack、seat/history/room joinなし                                                                  | 001,004     |
| REQ-CHAT-003 | 参加資格が確認できるsocketのみ履歴閲覧/投稿/room配信を受ける。lease確認不能やDB障害時は拒否                                                                                                      | 004         |
| REQ-CHAT-004 | lobbyはDB上の固定5 slotを全instanceで共有。5接続までjoin成功、6接続目は満席、履歴/受信/送信不可。別tabは別席。同一socketの重複・同時joinは既存seatを返しslotを増やさない。満席後は利用者が再試行 | 004,005     |
| REQ-CHAT-005 | join/rejoinで最大20件を返す。DBは `(created_at DESC, id DESC) LIMIT 20`、wire historyは昇順                                                                                                      | 003         |
| REQ-CHAT-006 | commentはtrim後1〜2,000 code points。Unicode astral文字の境界をコードポイントで検証し、trim済み値を保存                                                                                          | 002,004     |
| REQ-CHAT-007 | 参加leaseを確認し、DB insert transaction commit成功後だけroom配信する。投稿DTOのidと日時はDB値                                                                                                   | 002         |
| REQ-CHAT-008 | DB保存失敗時は配信なし、送信者へ固定安全エラー。例外・SQL・接続値をwire/logへ出さない                                                                                                            | 002,004     |
| REQ-CHAT-009 | 履歴取得/入室準備失敗を空履歴として扱わない。途中で取得した席は補償releaseし、履歴を漏らさない                                                                                                   | 003,004     |
| REQ-CHAT-010 | historyとlive/ackの競合はBIGINT十進文字列IDでupsertし、重複なし、時間/id順、最新20件に維持                                                                                                       | 003         |
| REQ-CHAT-011 | leaseは30秒、5秒ごと更新（後述の根拠）。切断時はtoken一致条件の即時release、異常終了はDB時刻で期限後に回収。古いtokenは新しいleaseを変更できない                                                 | 004,005     |
| REQ-CHAT-012 | reconnectは新Socketとして再join・再admission・履歴再取得。自動投稿再送しない。満席時は明示表示し利用者による再試行を待つ                                                                         | 003,004     |
| REQ-CHAT-013 | Socket.IO Postgres Adapterで別instanceへ同room eventを配信する。AdapterのLISTEN/NOTIFYはsession-capable接続に限定しNeon transaction poolを使わない。seat管理は別のDB transactionで行う           | 005         |
| REQ-CHAT-014 | username/commentをtextとして表示しHTML解釈しない。SQL parameter化、event payload上限、入力検証をserverで実施                                                                                     | 001,004     |
| REQ-CHAT-015 | chat page/Socketは既定停止。localhost開発で明示許可された場合のみ接続可能。Preview/Productionは設定確認と個別承認前は停止                                                                        | 005         |
| REQ-CHAT-016 | TOP、TODO V1/V2、AI V1/V2、DB check、404、JSON error契約を維持                                                                                                                                   | 005         |
| REQ-CHAT-017 | Socket JSON payload全体に16KiB上限を設け、超過は保存/配信前に拒否                                                                                                                                | 004         |
| REQ-CHAT-018 | chatは利用者間のテキスト機能。Gemini/AI V1/V2へ投稿を送らず、自動応答を生成しない                                                                                                                | 002,005     |
| REQ-CHAT-019 | seat有効性照合と投稿INSERT/履歴SELECTを同一DB transaction内で行う。broadcastは有効seatのSocket ID宛て。期限切れsocketは投稿・履歴・新着対象外。入室中切断の確保seatは補償解放                    | 003,004     |
| REQ-CHAT-020 | Adapter/DB共有配信障害時にlocal-only emitへ縮退しない。DB保存結果と全員への配信確認を分離し、確認できない配信は未確認とする。履歴差分同期/再入室で欠落を回復                                     | 002,003,005 |

## 3. Leaseの時間設定と根拠

- lease期限: **30秒**。process crash後のslot回収遅延を最大おおむね30秒に制限する運用目標であり、正確な切断検知時間を保証する値ではない。
- renewal: **5秒間隔**。30秒内に複数回の更新機会を持たせ、一時的な1回のDB遅延で即seatを失わないための設計値。renewはinstance単位にbatch化し、DB clockで `expires_at = CURRENT_TIMESTAMP + interval '30 seconds'` とする。
- lease/renewの数値は依頼者の明示値でなく、今回確定する初期値。disposable DB・multi-process試験で失効/回収/更新競合を確認し、実Neon・Vercelの遅延/停止時間で再評価する。
- renewal失敗が期限を越えた場合、該当socketはfail-closedで退室・切断扱いとする。満席の一時誤判定は許容し、席超過はしない。

## 4. 非機能・障害条件

- 入室状態はsocket単位でサーバー確認し、UIフラグを認可として使わない。
- duplicate joinは同一connection UUIDの既存leaseを返す。join中切断時はawait後にconnectedを再確認し、未接続なら同fencing tokenでrelease。DB側でもlease期限による最終回収を行う。
- send transactionはseat行を `FOR UPDATE` し、owner/lease token/期限をDB時刻で確認してからinsert・commit。旧socketやexpired socketは保存できない。
- historyはseat行をlock/renew確認し、同一transaction内でselectする。socketへの応答直前に未接続なら応答を捨て、lease解放。
- broadcast先はDBで有効性確認した最大5 Socket IDに限定する。Adapter送信は全socket受信ACKを証明しない。DB commitは成功しても配信は未確認となり得る。
- local emitへのfallbackは禁止。障害後は周期history sync/rejoinでDB上の差分を回収。同期期間中の欠落を隠さない表示にする。
- `innerHTML`禁止。ログはsocket/request IDと安全なerror categoryに限定し投稿本文/secretを含めない。
- DDL、依存、外部接続は文書確定後の実装タスクで行い、Neonへ自動適用しない。

## 5. トレーサビリティ

WISH IDは暫定分類で、教材正式WISH原本未取得。

| WISH          | REQ                     | DES                          | TASK  | TST                         |
| ------------- | ----------------------- | ---------------------------- | ----- | --------------------------- |
| WISH-CHAT-001 | 001,002,014             | DES-CHAT-001,002,006         | A,C,D | TST-01,11,14,19,22          |
| WISH-CHAT-002 | 006,007,008,013,018,020 | DES-CHAT-002,003,005,006,007 | C,E   | TST-03,04,12,15,16,26,29,36 |
| WISH-CHAT-003 | 005,009,010,012,019,020 | DES-CHAT-003,006             | B,D,E | TST-09,10,22-25,29          |
| WISH-CHAT-004 | 003,004,011,012,017,019 | DES-CHAT-002,004,006         | C,D,E | TST-13,17-25,27,28          |
| WISH-CHAT-005 | 013,015,016,018,020     | DES-CHAT-001,005,007,008     | A,E   | TST-02,05,26-36             |

| REQ | DES         | TASK    | TST               |
| --- | ----------- | ------- | ----------------- |
| 001 | 001,006     | A,D     | 01,19,22,35       |
| 002 | 002         | C       | 11                |
| 003 | 002,004     | C,D     | 17,19,25,28       |
| 004 | 004,005     | D,E     | 18,19,27          |
| 005 | 003,006     | B,D     | 09,10,23          |
| 006 | 002         | C       | 12,13             |
| 007 | 003,005     | C,E     | 03,04,15,26       |
| 008 | 002,003,005 | C,E     | 16,25,29          |
| 009 | 003,004     | B,D     | 09,25             |
| 010 | 006         | D       | 23,24             |
| 011 | 004         | D,E     | 20,21,28          |
| 012 | 006,007     | D,E     | 22,31             |
| 013 | 005,007     | E       | 26-29,33          |
| 014 | 002,003,006 | B,C,D   | 08,11,12,14,34    |
| 015 | 008         | A,E     | 02,25,30-33       |
| 016 | 001         | A,E     | 05,35             |
| 017 | 002,003     | C       | 13                |
| 018 | 002,008     | A,E     | 34,36             |
| 019 | 003,004,006 | B,C,D,E | 17,21,23,25,27,28 |
| 020 | 005,006,007 | C,D,E   | 29,31,33          |
