# AI会話アプリ V2 実装手順書

## 1. 運用ルール

- 本書は実装計画であり、ここに記載するTASKは未着手。V2コード、DDL、DB適用、Gemini通信、デプロイは今回行っていない。
- 実装はTASK順。前タスクの受入が失敗したら後続を開始せず、原因を直して再検証する。
- V1/TODOのコードとDB表は保護する。環境/秘密値は読み取らず、実Gemini・Neon確認は別途明示した承認/試験手順に従う。
- SQL生成と実DB適用は別工程。DDLをNeonに適用する場合は、差分・catalog照合・対象branch/databaseを利用者が確認し、明示承認後に行う。
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`, `git diff --check`を各実装PRの該当段階で実行。E2Eは実Gemini/DBをmockし、`page.route()`を使う。

## 2. トレーサビリティ

| TASK                              | 対応WISH       | 対応REQ                             | 対応DES                   |
| --------------------------------- | -------------- | ----------------------------------- | ------------------------- |
| TASK-V2-01 既存互換・ベースライン | 全WISH         | REQ-V2-010, 011                     | DES-V2-001, 006           |
| TASK-V2-02 DDL・Model             | WISH-V2-02, 03 | REQ-V2-001, 002, 003, 008           | DES-V2-002                |
| TASK-V2-03 会話一覧/作成API       | WISH-V2-02, 03 | REQ-V2-001, 002, 005, 010, 011      | DES-V2-001, 002, 003, 006 |
| TASK-V2-04 履歴API                | WISH-V2-01, 03 | REQ-V2-002, 003, 005, 008, 011      | DES-V2-002, 003, 006      |
| TASK-V2-05 文脈付き質問API        | WISH-V2-01, 03 | REQ-V2-003, 004, 005, 006, 008, 011 | DES-V2-002, 003, 004, 006 |
| TASK-V2-06 会話管理UI             | WISH-V2-02, 03 | REQ-V2-001, 002, 003, 007, 009      | DES-V2-001, 005           |
| TASK-V2-07 追加質問UI             | WISH-V2-01     | REQ-V2-004, 005, 006, 007, 009      | DES-V2-004, 005, 006      |
| TASK-V2-08 統合回帰・運用文書     | 全WISH         | REQ-V2-001〜011                     | DES-V2-001〜006           |

## 3. タスク

### TASK-V2-01：既存互換・ベースライン・設定確認

- **対応**: 全WISH / REQ-V2-010, 011 / DES-V2-001, 006
- **依存**: なし
- **変更対象**: 実装時は`docs/ai/v2/*`と必要最小限の`.env.example`またはREADME。ソース変更は原則なし。
- **実装/確認**: 最新mainとブランチ状態を確認。既存`src/app.ts` route/parser順、AI V1 guard/service/model、shared `requirePool()`、TODO route/SQL、package scripts、公開環境停止条件を記録。V2用guardは`NODE_ENV=development`かつ`AI_V2_DEMO_ENABLED=true`、かつ`VERCEL_ENV`未設定の場合のみ許可し、それ以外は未設定/不明環境を含め停止する。
- **試験**: 現行lint/typecheck/format/server tests/buildをbaselineとして実行。V1/TODOのroute/module/schema差分を保存。
- **完了条件**: baseline結果と実装差分範囲が記録され、公開環境でV2 APIを有効化する経路がないことをレビューで確認する。

### TASK-V2-02：V2 DDLとModel

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 003, 008 / DES-V2-002
- **依存**: TASK-V2-01
- **変更対象**: `sql/ai/040_create_ai_v2_tables.sql`、`src/apps/ai/v2/aiV2Model.ts`、`tests/server/ai-v2-model.test.ts`、`docs/ai/v2/*`
- **実装**: `ai_v2_conversations`と`ai_v2_turns`の非破壊DDL、1:多FK、検査可能なtitle/prompt/response制約、list/history/context query、DTO変換、shared pool、transaction insert+conversation update+rollback。既存表は変更しない。
- **試験**: DDLを使い捨てPostgreSQLで新規作成/再実行/定義不一致時停止を検証。ModelはPool/Clientを依存注入しSQL、値、並び、limit、rollbackをmock検証。Neonは使わない。
- **完了条件**: 2表の正確な定義とindex/制約をcatalog検査でき、旧表差分なし、Modelの成功/失敗/rollbackテストが通る。Neon適用の承認はこの完了に含めない。

### TASK-V2-03：会話作成・一覧APIと公開ガード

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 005, 010, 011 / DES-V2-001, 002, 003, 006
- **依存**: TASK-V2-01, 02
- **変更対象**: `src/app.ts`（V2 routerを共有urlencoded/JSON parserより前にmountする最小変更）、`src/apps/ai/v2/aiV2Router.ts`、`aiV2Controller.ts`、`aiV2Middleware.ts`、`aiV2Model.ts`、`tests/server/ai-v2-conversations.test.ts`
- **実装**: V2専用16KiB JSON parser、Content-Type/parser errors、local-only guard、POST conversation、GET list。title trim/codepoint検証、固定エラーDTO。
- **試験**: Supertestでtitle 1/50/51境界、補助Unicode、空白、type、bad JSON、413、415、順序、DB/内部エラー。`NODE_ENV` undefined/development/production、`VERCEL_ENV` unset/preview/production、flag true/falseを組合せ、development+flag true+Vercel env unset以外は停止しModel呼出0を確認。既存V1/TODO parser error testsも実行。
- **完了条件**: endpoint契約どおりのDTO/status、invalid bodyでDB 0回、Preview/Production/非development/不明環境で全V2 APIが停止。

### TASK-V2-04：選択会話の履歴API

- **対応**: WISH-V2-01, 03 / REQ-V2-002, 003, 005, 008, 011 / DES-V2-002, 003, 006
- **依存**: TASK-V2-02, 03
- **変更対象**: `aiV2Model.ts`、`aiV2Controller.ts`、`aiV2Router.ts`、`tests/server/ai-v2-turns.test.ts`
- **実装**: GET turns、canonical正整数で最大2,147,483,647のID検証、最新20件取得を古→新へ返却、存在しないconversationの固定404。
- **試験**: ID 1/max-int/max+1/zero/sign/exponent/leading-zero、0/1/20/21+ターン、同日時ID tie-break、昇順応答、会話間混入なし、DB障害、公開停止。Model/DB mockのみ。
- **完了条件**: 一つの会話の最新20件だけが正順で返り、他会話データが混ざらない。

### TASK-V2-05：直近5往復Gemini質問API

- **対応**: WISH-V2-01, 03 / REQ-V2-003, 004, 005, 006, 008, 011 / DES-V2-002, 003, 004, 006
- **依存**: TASK-V2-02〜04
- **変更対象**: `src/apps/ai/v2/aiV2Service.ts`、`aiV2Controller.ts`、`aiV2Model.ts`、V2 router、`tests/server/ai-v2-ask.test.ts`、SDK mock tests
- **実装**: prompt/ID validation、same conversation newest5 retrieval/reversal、current prompt append、`models.generateContent`、empty answer handling、AI後のDB transaction保存、保存完了後201。V1 Serviceを変更せず独立注入。
- **試験**: SDK境界mockでrole/order/contents/model/timeout/retryを確認。6+ historyでも5組のみ、他会話/V1を含まない。AI失敗/空回答でinsert0、DB rollbackで201なし、deferred transaction完了前はHTTP response未完了。同一会話のcontext version競合で409かつ保存0を確認。Neon/Gemini実通信なし。
- **完了条件**: AI成功かつDB commit後のみ201、service/DB失敗の安全なstatus、過去文脈の隔離を自動確認。

### TASK-V2-06：会話作成・一覧・選択UI

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 003, 007, 009 / DES-V2-001, 005
- **依存**: TASK-V2-03, 04
- **変更対象**: `public/ai/v2/index.html`、`public/ai/v2/app.js`、`public/ai/v2/style.css`、`tests/e2e/ai-v2.spec.ts`
- **実装**: V2 static page、create form、conversation list/select、turn history rendering、reload後list再取得から会話再選択、loading/empty/error/disabled状態。
- **試験**: Playwright `page.route()`でAPI mock。会話2件切替、保存history再取得、0件、HTTP/JSON異常、遅延した旧history応答の破棄、POST中の選択/新規作成ロック、HTML風title/historyがtext描画であること。
- **完了条件**: V2 pageで一覧と各履歴が別表示、reload後に選択再開、V1画面/TOP導線無影響。

### TASK-V2-07：追加質問UIと送信状態

- **対応**: WISH-V2-01 / REQ-V2-004, 005, 006, 007, 009 / DES-V2-004, 005, 006
- **依存**: TASK-V2-05, 06
- **変更対象**: `public/ai/v2/app.js`、必要最小限の`index.html`/`style.css`、`tests/e2e/ai-v2.spec.ts`
- **実装**: client title/prompt/body byte checks、submit `POST turns`、in-flight guard、valid 201 DTO check、success-only input clear、answer append and list/history refresh、known fixed error messages、failure/timeout input preservation and no retry.
- **試験**: UI route mockでsuccess, malformed 201, AI/DB/disabled, bad network, timeout(clock), repeated submit, POST中の会話切替無効化, XSS question/response, history refresh failure, 409 context conflict.
- **完了条件**: UI受入条件をすべてmock E2Eで満たし、post-commit uncertaintyを再送させない。

### TASK-V2-08：V1/TODO回帰・統合レビュー・運用資料

- **対応**: 全WISH / REQ-V2-001〜011 / DES-V2-001〜006
- **依存**: TASK-V2-01〜07
- **変更対象**: tests、`docs/ai/v2/*`、READMEは必要な範囲だけ。
- **実装/確認**: 全自動テストとsecret static check、API/UI traceability、V1/TODO diff/behavior回帰、公開環境guard、独立Codex review指摘対応。実DB/Gemini/Previewは行った主体/方法を分離記録。
- **試験**: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`, AI V2 Playwright, 既存AI/TODO server/E2E route mocks, `git diff --check`。Vercel public environmentはAPI disabledを検証し、Neon integrationはDDL承認/適用後の別試験。
- **完了条件**: 全REQに自動/手動/実機の検証状態があり、mockを実環境合格と混同せず、既存TODO/AI V1回帰成功、公開API停止、未確認事項/運用制限を記録。

## 4. 実装中に決める必要がある未決事項

1. 保存期間・削除/backup運用と、最大会話一覧件数。認証なしでデータが蓄積するため、公開前に運用責任者が決める。
2. 同一会話に複数タブ/複数クライアントが同時送信したときのturn順序。今回はUI一送信制御で通常操作を抑止するが、DB全体で厳密な順序/冪等性は保証しない。
3. Vercel Function timeoutとGemini/DB処理の合算余裕。対象Project実設定を確認するまで、Preview/Production APIは停止したまま。
4. Neon DDLの対象branch/databaseおよびcatalog差分。利用者の明示確認と承認済みDDLがなければ実DB適用しない。
