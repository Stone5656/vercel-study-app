# AI会話アプリ V2 実装手順書

## 1. 運用ルール

- 本書は実装計画と進捗記録を兼ねる。TASKごとの着手/完了は各節に記録し、V2コード・DDL・DB適用・Gemini通信・デプロイの実施範囲を`test-results.md`でも区別する。
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
- **実測結果**: 2026-11-25、branch `feature/ai-app-v2-implementation` / base `42db3e39e4f1eea117b0c2a74d6b8b61d55f8966`。lint/typecheck/format/build/diff-check成功、既存server tests 70/70成功。V2用guardを公開系統から独立させ、未設定環境も停止する方針をレビュー済み。
- **状態/未確認**: 完了。Vercel環境設定、Neon/Gemini実機は対象外で未確認。実DB依存の既存TODO E2Eは実行しない。

### TASK-V2-02：V2 DDLとModel

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 003, 008 / DES-V2-002
- **依存**: TASK-V2-01
- **変更対象**: `sql/ai/040_create_ai_v2_tables.sql`、`src/apps/ai/v2/aiV2Model.ts`、`tests/server/ai-v2-model.test.ts`、`docs/ai/v2/*`
- **実装**: `ai_v2_conversations`と`ai_v2_turns`の非破壊DDL、1:多FK、検査可能なtitle/prompt/response制約、list/history/context query、DTO変換、shared pool、transaction insert+conversation update+rollback。既存表は変更しない。
- **試験**: DDLを使い捨てPostgreSQLで新規作成/再実行/定義不一致時停止を検証。ModelはPool/Clientを依存注入しSQL、値、並び、limit、rollbackをmock検証。Neonは使わない。
- **完了条件**: 2表の正確な定義とindex/制約をcatalog検査でき、旧表差分なし、Modelの成功/失敗/rollbackテストが通る。Neon適用の承認はこの完了に含めない。
- **実測結果**: 2026-11-25、DDLを使い捨てDocker PostgreSQL 16で新規適用・再実行・同名CHECK制約不一致時の停止とatomic rollbackを確認。Modelテスト7/7、typecheck成功。Neon未接続/DDL未適用。
- **状態**: 完了。Neon catalog照合と実データ検証は未実施。

### TASK-V2-03：会話作成・一覧APIと公開ガード

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 005, 010, 011 / DES-V2-001, 002, 003, 006
- **依存**: TASK-V2-01, 02
- **変更対象**: `src/app.ts`（V2 routerを共有urlencoded/JSON parserより前にmountする最小変更）、`src/apps/ai/v2/aiV2Router.ts`、`aiV2Controller.ts`、`aiV2Middleware.ts`、`aiV2Model.ts`、`tests/server/ai-v2-conversations.test.ts`
- **実装**: V2専用16KiB JSON parser、Content-Type/parser errors、local-only guard、POST conversation、GET list。title trim/codepoint検証、固定エラーDTO。
- **試験**: Supertestでtitle 1/50/51境界、補助Unicode、空白、type、bad JSON、413、415、順序、DB/内部エラー。`NODE_ENV` undefined/development/production、`VERCEL_ENV` unset/preview/production、flag true/falseを組合せ、development+flag true+Vercel env unset以外は停止しModel呼出0を確認。既存V1/TODO parser error testsも実行。
- **完了条件**: endpoint契約どおりのDTO/status、invalid bodyでDB 0回、Preview/Production/非development/不明環境で全V2 APIが停止。
- **実測結果**: 2026-11-25、Supertest 8/8成功。タイトルtrim/Unicode境界、parser異常、Model障害、local-only guardの環境組合せ、guard先行を確認。lint/typecheck成功。
- **状態**: 完了。既存V1/TODO全suite回帰はTASK-V2-08で再実行する。

### TASK-V2-04：選択会話の履歴API

- **対応**: WISH-V2-01, 03 / REQ-V2-002, 003, 005, 008, 011 / DES-V2-002, 003, 006
- **依存**: TASK-V2-02, 03
- **変更対象**: `aiV2Model.ts`、`aiV2Controller.ts`、`aiV2Router.ts`、`tests/server/ai-v2-turns.test.ts`
- **実装**: GET turns、canonical正整数で最大2,147,483,647のID検証、最新20件取得を古→新へ返却、存在しないconversationの固定404。
- **試験**: ID 1/max-int/max+1/zero/sign/exponent/leading-zero、0/1/20/21+ターン、同日時ID tie-break、昇順応答、会話間混入なし、DB障害、公開停止。Model/DB mockのみ。
- **完了条件**: 一つの会話の最新20件だけが正順で返り、他会話データが混ざらない。
- **実測結果**: 2026-11-25、Supertest 6/6成功。ID 1/max-int受理、非canonical/範囲外をDB呼出前に拒否、空履歴と404の区別、固定DB/内部エラーを確認。Modelテストで最新20件・昇順を確認。
- **状態**: 完了。実Neonの会話/ターン存在・履歴は未確認。

### TASK-V2-05：直近5往復Gemini質問API

- **対応**: WISH-V2-01, 03 / REQ-V2-003, 004, 005, 006, 008, 011 / DES-V2-002, 003, 004, 006
- **依存**: TASK-V2-02〜04
- **変更対象**: `src/apps/ai/v2/aiV2Service.ts`、`aiV2Controller.ts`、`aiV2Model.ts`、V2 router、`tests/server/ai-v2-ask.test.ts`、SDK mock tests
- **実装**: prompt/ID validation、same conversation newest5 retrieval/reversal、current prompt append、`models.generateContent`、empty answer handling、AI後のDB transaction保存、保存完了後201。V1 Serviceを変更せず独立注入。
- **試験**: SDK境界mockでrole/order/contents/model/timeout/retryを確認。6+ historyでも5組のみ、他会話/V1を含まない。AI失敗/空回答でinsert0、DB rollbackで201なし、deferred transaction完了前はHTTP response未完了。同一会話のcontext version競合で409かつ保存0を確認。Neon/Gemini実通信なし。
- **完了条件**: AI成功かつDB commit後のみ201、service/DB失敗の安全なstatus、過去文脈の隔離を自動確認。
- **実測結果**: 2026-11-25、Service/HTTPテスト10/10成功。SDK mockでmodel/role/最新5 turn/current prompt/token/timeout/retry/continuationを確認。APIでAI失敗/空回答の保存0、DB/競合error、save promise完了前に未応答を確認。実Gemini/Neon通信なし。
- **状態**: 完了。実APIキー・Gemini quota、実Neon transactionは未確認。

### TASK-V2-06：会話作成・一覧・選択UI

- **対応**: WISH-V2-02, 03 / REQ-V2-001, 002, 003, 007, 009 / DES-V2-001, 005
- **依存**: TASK-V2-03, 04
- **変更対象**: `public/ai/v2/index.html`、`public/ai/v2/app.js`、`public/ai/v2/style.css`、`tests/e2e/ai-v2.spec.ts`
- **実装**: V2 static page、create form、conversation list/select、turn history rendering、reload後list再取得から会話再選択、loading/empty/error/disabled状態。
- **試験**: Playwright `page.route()`でAPI mock。会話2件切替、保存history再取得、0件、HTTP/JSON異常、遅延した旧history応答の破棄、POST中の選択/新規作成ロック、HTML風title/historyがtext描画であること。
- **完了条件**: V2 pageで一覧と各履歴が別表示、reload後に選択再開、V1画面/TOP導線無影響。
- **実測結果**: 2026-11-25、Chromium Playwright 7/7成功。会話作成/選択/切替、履歴分離、loading/empty、旧GET応答破棄、XSS風文字列の安全描画、質問フォームが未送信・無効であることを確認。
- **状態**: 完了。reload後はroute mockで一覧再取得を確認し、実DBからの永続データ再開は未実施。追加質問UIはTASK-V2-07。

### TASK-V2-07：追加質問UIと送信状態

- **対応**: WISH-V2-01 / REQ-V2-004, 005, 006, 007, 009 / DES-V2-004, 005, 006
- **依存**: TASK-V2-05, 06
- **変更対象**: `public/ai/v2/app.js`、必要最小限の`index.html`/`style.css`、`tests/e2e/ai-v2.spec.ts`
- **実装**: client title/prompt/body byte checks、submit `POST turns`、in-flight guard、valid 201 DTO check、success-only input clear、answer append and list/history refresh、known fixed error messages、failure/timeout input preservation and no retry.
- **試験**: UI route mockでsuccess, malformed 201, AI/DB/disabled, bad network, timeout(clock), repeated submit, POST中の会話切替無効化, XSS question/response, history refresh failure, 409 context conflict.
- **完了条件**: UI受入条件をすべてmock E2Eで満たし、post-commit uncertaintyを再送させない。
- **実測結果**: 2026-11-25、Chromium Playwright suite 17/17成功。成功/履歴再取得、保存後GET障害、validation/連打/作成・送信中の相互操作lock、known error固定文、45秒POST/15秒GET clock timeout、network/malformed 201不確定表示、XSS風prompt/response text描画をmockで確認。
- **状態**: 完了。実Gemini/Neonとの結合はTASK-V2-08でも行わず未実施。

### TASK-V2-08：V1/TODO回帰・統合レビュー・運用資料

- **対応**: 全WISH / REQ-V2-001〜011 / DES-V2-001〜006
- **依存**: TASK-V2-01〜07
- **変更対象**: tests、`docs/ai/v2/*`、READMEは必要な範囲だけ。
- **実装/確認**: 全自動テストとsecret static check、API/UI traceability、V1/TODO diff/behavior回帰、公開環境guard、独立Codex review指摘対応。実DB/Gemini/Previewは行った主体/方法を分離記録。
- **試験**: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`, AI V2 Playwright, 既存AI/TODO server/E2E route mocks, `git diff --check`。Vercel public environmentはAPI disabledを検証し、Neon integrationはDDL承認/適用後の別試験。
- **完了条件**: 全REQに自動/手動/実機の検証状態があり、mockを実環境合格と混同せず、既存TODO/AI V1回帰成功、公開API停止、未確認事項/運用制限を記録。
- **実測結果**: 2026-11-25、`pnpm lint/typecheck/format:check/test/build`と`git diff --check`成功。server tests 103/103。AI V1履歴/質問、AI V2、TOPのChromium E2E suite 55/55、うちV2 E2E 17/17。使い捨てPostgreSQL 16でDDL新規作成/再実行、同名NOT VALID constraintと不一致indexのfail-closed/rollbackを確認。公開停止/secret static/XSS自動検査成功。
- **レビュー**: 統合レビューでDDLの`NOT VALID` CHECK constraintを既存定義一致と誤認し得る点を発見。`convalidated`、PK/FKの遅延・参照動作をcatalog照合条件へ追加し、再試験成功。実Neon/Gemini/Vercel Productionの確認とは区別。
- **状態**: コード・自動検証・文書完了。利用者の実Neon DDL適用、実Gemini、Preview/実運用結合は未完了。実機確認後にこのPRをレビュー/マージする。

## 4. 実装中に決める必要がある未決事項

1. 保存期間・削除/backup運用と、最大会話一覧件数。認証なしでデータが蓄積するため、公開前に運用責任者が決める。
2. 同一会話に複数タブ/複数クライアントが同時送信したときのturn順序。今回はUI一送信制御で通常操作を抑止するが、DB全体で厳密な順序/冪等性は保証しない。
3. Vercel Function timeoutとGemini/DB処理の合算余裕。対象Project実設定を確認するまで、Preview/Production APIは停止したまま。
4. Neon DDLの対象branch/databaseおよびcatalog差分。利用者の明示確認と承認済みDDLがなければ実DB適用しない。
