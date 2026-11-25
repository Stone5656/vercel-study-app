# リアルタイムチャット機能 要望書（暫定）

## 文書の位置付け

教材の正式な `01_request.md` と WISH ID は今回の調査で確認できていない。このため本書の WISH-CHAT-001〜005 は、依頼文を整理した**暫定的な要望分類**であり、教材の正式な要望 ID や原文を再現したものではない。正式資料が得られた場合は照合して差し替える。

## 対象システムの現状

2026-11-25 に最新 `main`（`1c1fa09`）を調査した。

| 項目                   | リポジトリで確認した事実                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package Manager / 起動 | `pnpm`; `pnpm dev` は `tsx watch src/server.ts`、`pnpm start` は `node dist/server.js`                                                               |
| Express / HTTP         | Express 5。`src/app.ts` が Express app を作成・exportし、`src/server.ts` が現在 `app.listen()` を実行                                                |
| フロント               | `public/` を Express static 配信、EJS の TOP は `views/`                                                                                             |
| 責務分割               | `src/apps/{todo,ai}/` の Router / Controller / Model / Service を機能別に配置。一部機能は全責務を持たない                                            |
| DB                     | `src/db.ts` が `pg.Pool` を共有。`DATABASE_URL` 未設定なら Pool は `null`、`requirePool()` は呼出し時に失敗。既存 Pool の `max` はプロセスあたり `2` |
| 認証                   | 確認した既存コードにユーザー認証・認可はない。表示名は本人確認に使えない                                                                             |
| 404 / エラー           | `src/app.ts` に明示的な catch-all 404/error handler はない。Express の既定の 404/error handling を利用。TODO と AI API は機能別のエラー形式を持つ    |
| 公開制御               | AI V1/V2 には個別の停止ガードがある。チャット向け Socket/HTTP guard は存在しない                                                                     |
| SQL                    | `sql/ai/030`, `040`、`sql/todo/020`, `021` 等の番号付き SQL。SQL は手動適用が基本で、作成だけでは DB は変更されない                                  |
| Vercel                 | ルートに `vercel.json` はない。Vercel 設定・実効デプロイ構成は Git だけから確定しない                                                                |

## 暫定 WISH

これらは依頼者が今回示した機能要望の分類である。教材の正式な原文・IDとして扱わない。

| ID            | 暫定的な要望                                                                      |
| ------------- | --------------------------------------------------------------------------------- |
| WISH-CHAT-001 | `/chat/` で画面を開き、ユーザー名とコメントで会話したい                           |
| WISH-CHAT-002 | 同じルームの参加者へコメントをリアルタイム配信し、DB 保存後の投稿だけを共有したい |
| WISH-CHAT-003 | 入室時・再接続時に直近履歴を表示し、履歴取得と新着の重複を避けたい                |
| WISH-CHAT-004 | 1ルーム最大5接続とし、切断・再接続・異常終了を考慮して席を管理したい              |
| WISH-CHAT-005 | 複数インスタンスでの配信・定員を同期し、既存アプリ機能を維持したい                |

## 要望と設計候補の区別

- 実装スコープは単一 `lobby` ルーム、5 Socket接続。別tabは別接続。
- 表示名はtrim後1〜30、コメントはtrim後1〜2,000 Unicodeコードポイント。
- 表示名は公開用ラベルであり、本人確認・認可を提供しない。
- 投稿IDはDBのBIGINT、wireでは10進文字列。履歴は最新20件を古い順に表示する。
- Socket の入室 ack で認証済み参加者に履歴を返す案を第一候補とする。
- Socket.IO Postgres AdapterとPostgreSQL共有席を採用する。ただし実Neon/Vercel適合性は未確認。Adapterはsession接続、通常SQLは別Poolとし、transaction-pooling endpointでLISTEN/NOTIFYを行わない。
- 公開環境は明示的な許可がない限り停止する。

この候補は要望そのものではなく、要件・設計レビューで変更可能である。
