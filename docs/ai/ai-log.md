# AI活用記録

## 2026-11-18 TASK-07

### 修正・確認

- 初期履歴GETとPOST後の履歴更新にそれぞれ15秒のAbortController deadlineを加えた。タイマーは各呼出しのfinallyで解除する。古いGETはrequest idで結果反映を拒み、新しいGETは前のcontrollerをabortする。
- 履歴APIはHTTP 200のみ正常扱いとし、503 `DEMO_DISABLED`だけは別の停止状態とする。201など他の2xxはエラー表示。
- DB保存を表す未完了Promiseを使い、save完了前にSupertest応答が返らないことを確認した。
- AI停止ガードの後も共有JSON parser/TODO routerへPOSTが通り、TODO JSON parse errorが`BAD_REQUEST`のままの回帰テストを追加した。
- TASK-05/06のroot-owned Playwright出力ディレクトリは変更せず、task07 E2Eを`/tmp`へ出した。

### T01〜T20棚卸しと検証

- Supertest/fake Service/Model: T01, T03-T11, T15。Gemini failure、空回答、DB failure、入力境界、disabled/Productionを再確認。T01にsave未完了時の応答保留を追加。
- Playwright route mock: T02, T12-T14。POST/GETすべてmockし、実サービスへ通信していない。
- Model/SQL静的: T17はModel fakeと21件UI mock、T18はSELECT文字列でtie-breakのSQL句を確認。PostgreSQL上の実順序は未検証。
- SDK境界mock: T19で現在のpromptだけをSDKへ渡す構成を確認。
- 静的 security/source確認: `public/`にAPI key、DB URL、Gemini SDK識別子なし、AI UIに`innerHTML`代入なし。`.env`系を除外したcredential-shaped source scanは一致なし。Gemini loggerは固定診断文字列のみ。秘密ファイルの値は出力・転載していない。
- `pnpm test`: 70 tests / 9 suites成功。TODO V1/V2 server testsに加え、AI無効時のTODO JSON POSTと既存parse error契約をfake modelで確認。実DB TODO E2Eは未実施。
- Playwright: 37/37 Chromium tests成功。初期/POST後history timeout、201 GET拒否、競合、POST timeout、errorからの再操作を含む。

### 未解決

- `sql/ai/030_create_ai_qa_logs.sql`のnamed CHECK制約は存在確認のみで式の完全一致を確認せず、同名indexが別定義なら`IF NOT EXISTS`が検出しない。`created_at` defaultも非NULLのみ確認する。NeonへSQLは実行していない。
- DDL修正案: CHECKは`pg_get_constraintdef`、indexは`pg_get_indexdef`と`pg_index`のkey/order/direction、defaultは`pg_get_expr`で期待定義と比較するread-only preflightを追加し、差異時は停止する。
- 実Neon、実Gemini、Preview/Production実環境は未確認。

## 2026-11-18 TASK-06

### 実装判断

- フォーム送信を非同期化し、trim後のコードポイント数とJSON本文byte数を送信前に検査した。送信中フラグとdisabledボタンを併用する。
- HTTP 201とDTO全項目を検証してから回答を表示し、入力欄をクリアする。既知HTTP/code組み合わせだけ安全な固定文に変換し、APIの任意messageは表示しない。
- POST成功後は履歴取得処理を再利用する。GET失敗を質問送信の失敗にしない。
- fetch中断はサーバー側処理を取り消す保証がないため、45秒timeout時に保存結果不明と履歴確認を案内し、自動再送しない。ネットワーク失敗も結果不明の固定案内とする。
- Playwright fake clockでtimeoutを検証した。POST/GETはすべてroute mockで、実Gemini/Neonを使わない。
- TASK-05のAI_UNAVAILABLE status不一致はPR #6で解消済みに更新した。SQLの制約/index完全照合レビュー指摘は未解決のまま維持する。

### 検証

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`（68件/9 suites）, `pnpm build`, `git diff --check`: 成功
- Playwright: 履歴・質問UI 32/32件成功
- 既存root所有`test-results/`の権限は変更せず、E2E結果は`/tmp/vercel-study-ai-task06-results`へ出力した。

### 未実施

- 実Neon、実Gemini、Vercel Preview/Production
- 実回線timeout後のserver-side処理・保存状態
- DB依存のTODO E2E

## 2026-11-18 TASK-05

### 実装判断

- `express.static(public)`が`/ai`を`/ai/`へredirectし、`public/ai/index.html`を配信できることをChromium E2Eで確認したため、Express routeを追加しなかった。
- 初期表示で履歴APIを1回取得し、status/JSON/DTOを検証した後、返却順を維持して最大20件を表示する。自動再試行はしない。
- ローディング、空、一般エラー、`DEMO_DISABLED`を分け、APIのエラー本文は表示しない。
- 質問と回答はDOM elementの`textContent`として表示し、HTML/Markdown解釈を避ける。質問フォームは送信未実装のためdisabledとし、submitもpreventDefaultする。
- Playwrightの履歴APIはすべてroute mock。reloadによる再取得は確認したが実Neonの永続化は未確認。
- TASK-04レビュー指摘だった設定不足時503とGemini失敗502の`AI_UNAVAILABLE` status不一致はPR #6で502へ統一済み。以前の記録は対応済みに更新する。
- `ai_qa_logs`の既存同名制約と複合indexが完全一致するかというSQLレビュー指摘を保持する。

### 検証

- `pnpm lint`: 成功
- `pnpm typecheck`: 成功
- `pnpm format:check`: 成功
- `pnpm test`: 68 tests / 9 suites成功（TODOサーバーテストを含む）
- `pnpm build`: 成功
- `git diff --check`: 成功
- AI履歴UI Playwright: 15/15 Chromium tests成功。`.last-run.json`の既存権限問題を避け、出力先を`/tmp/vercel-study-ai-task05-results`に指定。

### 未実施

- 実Neon履歴の表示と永続化確認
- 実Gemini、Preview、Productionの実環境確認
- 実DB依存の既存TODO E2E（今回のAI UIテストでは実DB操作を避けるため未実行）

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
