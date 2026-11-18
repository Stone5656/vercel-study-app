# AI活用記録

## 2026-11-18 TASK-04

### SDKとService

- Google公式`@google/genai`を3.4.0でexact pinした。SDKはNode.js 22以上を要求し、実行確認環境はNode 26。
- `createGeminiAnswerService()`は環境から`GEMINI_API_KEY`と`GEMINI_MODEL`を呼出し時に読む。未設定でも起動時にclientを生成せず、API呼出し時の例外をControllerが502 `AI_UNAVAILABLE`へ変換する。
- `models.generateContent`へ現在のpromptだけを渡し、output 1024、30,000ms HTTP timeout、retry attempts 1、automatic continuation false、automatic function calling disabledを指定した。
- timeoutはSDKのHTTP request単位であり、Function全体やDB保存を含む期限ではない。
- client factoryを依存注入可能にし、自動テストはfake clientを使う。実Geminiへの通信はしていない。
- mock選択はローカルでdemo=trueかつmock=trueの場合に限定。Previewはmockを選ばずGemini Serviceを使用する。Productionは公開guardでService実行前に停止する。
- 失敗時は秘密、質問・回答、例外詳細をログに出さず、固定の一般診断メッセージだけを記録する。

### 未検証

- 実Gemini API keyを使ったリクエスト
- 実Neonへの保存・履歴再取得（DDLの制約/index完全照合レビューが未解決）
- Vercel Node.js runtime、Function実行上限、Previewアクセス保護

## 2026-11-18 TASK-03

### 対象

REQ-AI-002, 003, 005, 006, 009, 010, 013, 014およびDES-AI-001, 002, 003, 005, 009。

### 判断・採否

- 共通`express.json()`より先に登録済みのAI Router内で、demo guard、Content-Type、16KiB JSON parser、専用parser error handlerの順に処理する構成を採用した。
- `strict: false`を指定し、有効JSONのnull/配列/scalarをControllerでobject validationする。構文破損だけを`INVALID_JSON`に分類する。
- prompt長はUTF-16 code unitではなく`Array.from(trimmedPrompt).length`で測定する。
- ServiceとDB save関数を注入可能にし、Service成功→空回答検証→INSERT→DB `RETURNING` DTO→201の順序をテストした。
- 模擬回答をローカル限定とするため、`AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=true`、`VERCEL_ENV`未設定をすべて必要とする。実Gemini SDK/通信は未導入。
- DB INSERTは`$1`, `$2` placeholderと`RETURNING`を使い、接続/SQL詳細は固定エラーへ隠す。
- SQLの既存制約式とindex key/order/directionの完全照合は未解決レビュー指摘として残した。NeonへのDDL・INSERTは実施しない。

### 検証

- `pnpm lint`: 成功
- `pnpm typecheck`: 成功
- `pnpm format:check`: 成功
- `pnpm test`: 62件、8 suites成功（fake Service/ModelによるTASK-03、TASK-02履歴、TODO V1/V2を含む）
- `pnpm build`: 成功
- 実Neon、実Gemini、Vercel環境: 未実施

## 2026-11-18 TASK-02

### 対象

REQ-AI-003, 004, 009, 010, 013, 015およびDES-AI-001, 003, 005, 006, 009。

### 調査・判断

- `src/db.ts`の`requirePool()`を再利用し、新しいPoolは作成しない。
- 共通`express.json()`より前というAIルーター位置を維持した。
- 今回はGET履歴APIに限定され、POST保存は禁止されているため、AI専用JSON parserは実装しなかった。既存計画との差分を`tasks.md`へ記録し、TASK-03へ延期した。
- DB例外と想定外例外を安全に区別するため、Model境界で`AiDatabaseError`を使用した。
- Controllerへ`AiHistoryModel`を注入し、Modelの行readerも差し替え可能にした。
- SQLは同名テーブルを自動変更せず、事前確認queryとDDL内安全確認を設けた。
- PostgreSQLは`char_length`、TASK-03のTypeScriptは`Array.from(...).length`を使う方針とし、UTF-16 code unitの`string.length`は採用しない。

### 採用しなかった案

- 実NeonへのDDL適用: SQL承認前のため不採用。
- Gemini SDK/通信: TASK-04範囲のため不採用。
- SQL formatter plugin追加: 不要な依存追加になるため不採用。
- DBエラーを文字列やdriver codeだけで判定: 内部実装依存と誤分類を避けるため不採用。

### 検証経過

1. 最初の全テストでは49/50件成功。TASK-01の有効時テストが既定履歴Modelへ到達し、環境内DB設定による接続を試みて503となった。
2. 秘密値は読み取らず、当該テストへfake Modelを注入して実DB経路を除去した。
3. 再実行で50/50件、7 suitesが成功。lint、型検査、format、buildも成功した。

### 未検証

- SQL構文と制約の実Neon上での実行
- 既存`ai_qa_logs`の有無・定義
- 実DBから返るTIMESTAMPTZのDTO変換
- Vercel Preview/Production
- T06〜T08およびTASK-03以降
