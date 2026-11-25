# AI会話アプリ V2 設計書

## 1. 目的・設計原則

会話単位の追加質問、切り替え、再読み込み後の再開を、既存のExpress/TypeScript/Neon/Gemini構成に追加する。既存AI V1/TODOは別モジュールのまま保ち、新しいV2 router/controller/service/model/middlewareとV2専用DB表を使う。V2 APIは公開環境で常時停止する。

## 2. 要件との対応

| 設計ID     | 設計対象                   | 対応WISH           | 対応REQ                   | 対応TASK                   | 主な受入確認                                     |
| ---------- | -------------------------- | ------------------ | ------------------------- | -------------------------- | ------------------------------------------------ |
| DES-V2-001 | アプリ統合・ファイル配置   | WISH-V2-02, 03     | REQ-V2-007, 010           | TASK-V2-01, 03, 06, 08     | 静的画面配信、既存ルート回帰、V2 router独立      |
| DES-V2-002 | 会話・ターンDB設計とModel  | WISH-V2-01, 02, 03 | REQ-V2-001, 002, 003, 008 | TASK-V2-02〜05             | SQL/DTO/順序/transaction mock、分離したテーブル  |
| DES-V2-003 | HTTP APIと入力/エラー契約  | WISH-V2-01, 02, 03 | REQ-V2-001〜006, 011      | TASK-V2-03〜05, 08         | Supertestの各status・payload・未完了保存を検証   |
| DES-V2-004 | Gemini文脈と送信処理       | WISH-V2-01         | REQ-V2-004, 006           | TASK-V2-05, 07             | SDK境界で同一会話の直近5往復だけを確認           |
| DES-V2-005 | ブラウザー画面と状態管理   | WISH-V2-01, 02, 03 | REQ-V2-002, 003, 007, 009 | TASK-V2-06, 07             | Playwright mockで作成/選択/再読込/送信/XSSを確認 |
| DES-V2-006 | 公開停止・障害処理・安全性 | WISH-V2-01, 03     | REQ-V2-006, 009, 010, 011 | TASK-V2-01, 03, 05, 07, 08 | local/Preview/Production guardと固定error確認    |

## 3. アーキテクチャと責務（DES-V2-001）

### 3.1 ファイル構成案

```text
src/
├── app.ts                           # V2 routerをshared express.json()より前に追加
└── apps/ai/v2/
    ├── aiV2Router.ts                # V2 API route、専用JSON parser、guard
    ├── aiV2Controller.ts            # 入力/ID検証、statusと固定JSON応答
    ├── aiV2Service.ts               # 会話作成/質問の業務順序、Gemini文脈組立
    ├── aiV2Model.ts                 # V2専用SQL、DTO、transaction
    └── aiV2Middleware.ts            # local-only公開停止、parser error変換
public/ai/v2/
├── index.html                       # V2画面
├── app.js                           # API通信、UI状態、DOM描画
└── style.css                        # V2画面専用スタイル
sql/ai/040_create_ai_v2_tables.sql   # V2専用DDL（実装TASKで作成、今回未作成）
tests/server/ai-v2-*.test.ts         # Node Test Runner/Supertest
tests/e2e/ai-v2.spec.ts              # Playwright route mock
```

既存`src/db.ts`の`requirePool()`を再利用し、V2用Poolは作成しない。既存`express.static(public)`が`/ai/v2/`を配信するため、画面だけのExpress routeは追加しない。

`src/app.ts`ではV2専用routerを既存の共通`express.urlencoded()`/`express.json()`より前に登録する。これによりV2の公開停止とContent-Type検査が共有parserより先に行われ、V2専用`express.json({limit: 16_384})`がJSON本文を処理する。Router内は公開ガード、Content-Type確認、専用JSON parser、parser error変換、controllerの順。既存V1/TODOのparser順とJSON error handlerは変更しない。

## 4. 画面設計（DES-V2-005）

URLは`/ai/v2/`。静的画面はAPI停止中でも表示可能だが、公開環境ではデータ操作を行えない旨を固定案内する。

画面要素:

1. タイトル「AI会話アプリ V2」とTOP/AI V1へ戻るリンク。
2. 新規会話名入力（最大入力長は利便性用）、作成ボタン。
3. 会話一覧。タイトルと更新日時を表示し、選択中を明示。
4. 選択会話のターン履歴。初回取得は最新20往復を古い順で表示。
5. 質問入力欄と送信ボタン。選択会話なしの場合は無効。
6. 一覧/履歴の初期loading、空、disabled、失敗状態と、作成/送信中、回答、送信失敗状態。

APIからの履歴順を表示し、client側でソートしない。履歴GETには選択IDと世代番号を持たせ、切替後に到着した旧応答は破棄する。POST中は会話切替・新規作成・別質問をdisabledにし、リクエスト終了まで元の会話コンテキストを保つ。質問、回答、会話名は`createElement`、`textContent`、`append`/`replaceChildren`で描画し、`innerHTML`は禁止。改行はCSS `white-space: pre-wrap`で保持する。

## 5. API設計（DES-V2-003）

共通成功/失敗JSONはV1の既存表現に揃える。要求bodyはJSON、最大16,384 bytes。日時はISO 8601文字列。全POSTでrequest body以外の履歴をクライアントから受け取らない。

### 5.1 会話作成

`POST /api/ai/v2/conversations`

```json
{ "title": "設計メモ" }
```

201: `{ "success": true, "item": { "id": 1, "title": "設計メモ", "createdAt": "...", "updatedAt": "..." } }`

### 5.2 会話一覧

`GET /api/ai/v2/conversations` → 200 `{ "success": true, "items": [ConversationDTO, ...] }`。SQL順は`updated_at DESC, id DESC`。

### 5.3 Path ID検証

`:conversationId`は`^[1-9][0-9]*$`に一致し、値が2,147,483,647以下のときだけ受理する。PostgreSQL signed `INTEGER`の上限を超えないよう、DB query前に数値変換・`Number.isSafeInteger`・正数・最大値を検査する。符号、指数表記、ゼロ、先頭ゼロ等は400 `VALIDATION_ERROR`。

### 5.4 選択会話の履歴

`GET /api/ai/v2/conversations/:conversationId/turns` → 200 `{ "success": true, "items": [TurnDTO, ...] }`。最新20往復をSQLで降順に取得し、API DTOは古い順（`created_at ASC, id ASC`相当）へ並べる。Turn DTOは`{ id, conversationId, prompt, response, createdAt }`。

### 5.5 質問送信

`POST /api/ai/v2/conversations/:conversationId/turns`

```json
{ "prompt": "先ほどの案の次の手順は？" }
```

処理順: gate→Content-Type/body parse→path ID/prompt validation→会話存在確認→同一会話の直近5ターンとcontext version（最後のturn ID。履歴なしはnull）取得→Gemini回答生成→回答空チェック→DB transactionでconversation rowを`FOR UPDATE`し、最新turn IDがsnapshotと同じか検査→一致ならturn INSERTとconversation.updated_at更新→commit後に201 Turn DTO。不一致はrollback、409 `CONVERSATION_CHANGED`。

DB確定前に201を返さない。Gemini失敗/空回答は保存しない。DB失敗は非201。UIは失敗時に入力を保持し自動再送しない。

同一ブラウザー画面ではPOST中に会話切替、新規作成、別質問を無効化する。別タブ/APIからの同時送信はDB transaction内のsnapshot比較で検出する。古い文脈で生成した回答を無言で同一会話へ追加しない。

### 5.6 エラー契約

| HTTP | code                     | 条件                          |
| ---- | ------------------------ | ----------------------------- |
| 400  | `VALIDATION_ERROR`       | title/prompt/path値の形式不正 |
| 400  | `INVALID_JSON`           | JSON parse failure            |
| 413  | `PAYLOAD_TOO_LARGE`      | 16 KiB超                      |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | JSON以外                      |
| 404  | `CONVERSATION_NOT_FOUND` | IDが存在しない                |
| 409  | `CONVERSATION_CHANGED`   | 文脈取得後、保存前に履歴更新  |
| 502  | `AI_UNAVAILABLE`         | API失敗、空回答、設定不足     |
| 503  | `DB_UNAVAILABLE`         | DB接続/読込/transaction失敗   |
| 503  | `DEMO_DISABLED`          | local flag offまたは公開環境  |
| 500  | `INTERNAL_ERROR`         | その他の例外                  |

固定安全messageのみ返す。SQL、exception、Gemini raw response、API key、DB接続文字列は返さない。

## 6. データベース設計（DES-V2-002）

V1の単発ログを変更せず、V2専用の2表を新設する。

### `ai_v2_conversations`

| 列           | 型          | 制約/用途                                                       |
| ------------ | ----------- | --------------------------------------------------------------- |
| `id`         | INTEGER     | GENERATED ALWAYS AS IDENTITY PRIMARY KEY                        |
| `title`      | TEXT        | NOT NULL、trim後のコードポイント数1〜50、空白のみ不可           |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP                              |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP、ターン保存transactionで更新 |

### `ai_v2_turns`

| 列                | 型          | 制約/用途                                        |
| ----------------- | ----------- | ------------------------------------------------ |
| `id`              | INTEGER     | GENERATED ALWAYS AS IDENTITY PRIMARY KEY         |
| `conversation_id` | INTEGER     | NOT NULL、conversationへのFOREIGN KEY            |
| `prompt`          | TEXT        | NOT NULL、1〜2,000 Unicode文字相当、空白のみ不可 |
| `response_text`   | TEXT        | NOT NULL、空白のみ不可                           |
| `created_at`      | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP               |

索引案: `ai_v2_turns(conversation_id, created_at DESC, id DESC)`、`ai_v2_conversations(updated_at DESC, id DESC)`。外部キー削除動作は会話削除API対象外だが、将来手動削除時の安全性を考えてRESTRICT/NO ACTION相当とする。CHECK/PK/index/defaultはV1で導入したcatalog照合方式を参考にDDL内で不一致なら停止し、`IF NOT EXISTS`単独を一致判定に使わない。

質問・回答の1ターンを1行に保存するため、両者の片方だけが残らない。ServiceはGemini後にClient transactionを開始する。まずconversation rowを`SELECT ... FOR UPDATE`でロックし、そのstatement完了後の別statementで最新turn IDを読み、Gemini文脈取得時のsnapshotと比較する（READ COMMITTEDで最新コミットを可視化するため別statementにする）。一致する場合のみturn insertとconversation timestamp updateを同じtransaction内で行う。snapshotが異なればROLLBACKして409、DB失敗時もROLLBACKし201を返さない。外部AI成功後にDB失敗/競合した場合はAI費用が発生しても非成功応答になりうることをUIで案内し、自動再送しない。

### 履歴・文脈SQL順序

- 表示履歴: `WHERE conversation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 20` →結果をreverseして古い順に返す。
- Gemini文脈: 同じ会話IDで`ORDER BY created_at DESC, id DESC LIMIT 5` →各prompt/responseを逆順化して古い順にGeminiへ並べる。
- List: `ORDER BY updated_at DESC, id DESC`。
- 全SQLはplaceholderを利用する。

## 7. Gemini Service/失敗処理（DES-V2-004 / DES-V2-006）

既存`@google/genai`をサーバー側だけで使い、単一の`models.generateContent`呼出しとする。modelは`GEMINI_MODEL`、keyは`GEMINI_API_KEY`。`contents`は対象会話の保存済み最大5 user/modelペアと今回質問のみ。別会話・V1履歴は含めない。V1のtoken/timeout/retry設定を継承し、SDK境界mockでオプションの有効性を確認する。ストリーミング、chat session、function calling、自動再試行は使わない。

空/空白回答、応答欠落、timeout、API制限、通信例外は`AI_UNAVAILABLE` 502へ固定変換し、DB保存を行わない。履歴照会/作成/保存エラーは`DB_UNAVAILABLE` 503。会話IDが形式的に有効で対象なしは404。予期しない例外は500。

## 8. 公開停止と設定

V2専用の`AI_V2_DEMO_ENABLED`を導入する。router guardは`VERCEL_ENV`が定義済み、`NODE_ENV !== 'development'`、またはflagがtrue以外なら503 `DEMO_DISABLED`で停止する。従ってVercel Preview/Production、非Vercel production、Node environment未設定/不明も停止し、明示的な`NODE_ENV=development`とflag trueのローカルだけを許す。非Vercelの運用環境では`NODE_ENV=production`を必須とする。V1の`AI_DEMO_ENABLED`判定を変更・流用しない。

公開停止中は全`/api/ai/v2/*`でGemini/DB呼出し0回。静的`/ai/v2/`ページは配信されても、APIが停止中であることを説明する。Preview protectionがあるだけではV2有効化を許可せず、本要件では公開環境APIは停止を固定する。

## 9. 異常系・整合性・セキュリティ

- body parserはV2専用、16 KiB。V2 routerを共通urlencoded/JSON parserより先にmountし、V1/TODOのparserとerror handlerを変更しない。
- prompt/titleはクライアントとサーバーの両方で検証し、サーバー値を正とする。長さ計算はtrim後の`Array.from(value).length`。
- IDはcanonicalな正の10進表現かつ`1..2_147_483_647`に限定し、SQLはparameterized。
- 同一画面ではPOST中に切替/作成/次送信をロックする。別タブ/直接APIの競合はcontext snapshotをtransaction内で比較し、古くなった回答は409として保存しない。履歴GETは選択ID/世代を照合して旧応答を破棄する。冪等APIは対象外。
- API status、JSON parse、DTO shapeをクライアントで検証。質問/回答/titleにHTMLを解釈させない。
- 認証/ユーザー分離なしのため公開APIは禁止。error response/logにprompt、回答、API key、DATABASE_URL、SQL文字列を記録しない。
- abort/ネットワーク障害時にDB結果が不明なら再送しない。会話履歴を再取得して確認するよう案内する。

## 10. まだ決めていない事項

保存期間/削除運用、最大一覧件数/ページング、接続pool上限の長期運用評価、複数タブ競合時の厳密な会話順序、V2 Functionの実行上限は未確定。実装前TASK-V2-01の確認と設計レビューで決定し、ユーザーに明示なく削除・期限・公開設定を仮定しない。
