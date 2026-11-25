# vercel-study-app

Express、TypeScript、EJSを使用したWebアプリケーションです。

## TODO アプリ V1 / V2

V1 と V2 は API・画面・DB テーブルを分離しています。V1 は `/todo` と `/api/v1/todos`、`todo_tasks` を使い、V2 は `/todo-v2` と `/api/v2/todos`、`v2_todo_tasks` を使います。V2 は優先度（low / normal / high）と完了状態・優先度の絞り込みに対応します。V1 のデータを V2 へ移行しません。

## Neon PostgreSQL

PostgreSQL 接続には `pg` の共有 Pool を使い、接続文字列は環境変数 `DATABASE_URL` から読み込みます。ローカルでは `dotenv/config` が `.env` を読み込みます。`.env` は Git にコミットしないでください。Vercel では Preview / Production の各環境に `DATABASE_URL` を登録します。

- `/api/db-check`: `SELECT 1` を実行して DB 接続を確認します。接続できない場合は HTTP 503 を返します。
- `/db-sample`: `products` を ID 順に読み込み、商品一覧を表示します。DB を利用できない場合は HTTP 503 を返します。
- `sql/000_check_connection.sql`: Neon SQL Editor で接続先と SQL 実行可否を読み取り専用で確認します。
- `sql/010_setup_sample_products.sql`: 演習用テーブルとサンプル商品を作成します。初回実行前に Neon SQL Editor で対象ブランチ・DB と既存テーブルを確認してください。

SQL ファイルをリポジトリに保存しただけでは Neon 上で実行されません。対象 Neon ブランチとデータベースを選んで Neon Console の SQL Editor で実行します。実行順序と記録は [`sql/README.md`](sql/README.md) を参照してください。

### ローカルでの DB 確認

1. `.env` に `DATABASE_URL` を設定します（値は共有・コミットしないでください）。
2. `pnpm install --frozen-lockfile` を実行します。
3. `pnpm dev` を起動し、`http://localhost:3000/`、`http://localhost:3000/api/db-check`、`http://localhost:3000/db-sample` を確認します。
4. 本番ビルドの確認には `pnpm build`、続けて `pnpm start` を使います。

Preview と Production は別々の Vercel デプロイ環境で、環境変数もそれぞれ設定されます。どのデータベースの実体を見るかは、各環境に登録した `DATABASE_URL` が決めます。この授業設定では両環境が同じ Neon ブランチ・データベースを参照しますが、Vercel の環境変数設定が異なればデータも異なります。

## Dev Containerで開発する

1. VS Codeでこのリポジトリを開きます。
2. **Dev Containers: Reopen in Container** を実行します。
3. コンテナの作成完了後、`pnpm dev` を実行します。
4. `http://localhost:3000` を開きます。

ホストOSへNode.js、pnpm、Chromiumを別途インストールする必要はありません。

## コマンド

- `pnpm dev`: 開発サーバーを起動します。
- `pnpm lint`: TypeScriptをESLintで検査します。
- `pnpm typecheck`: TypeScriptの型を検査します。
- `pnpm format`: Prettierでファイルを整形します。
- `pnpm format:check`: Prettierによる整形状態を検査します。
- `pnpm test`: Supertestを使ったサーバーテストを実行します。
- `pnpm test:e2e`: Chromiumを使ったPlaywright E2Eテストを実行します。
- `pnpm build`: TypeScriptを`dist/`へコンパイルします。

## AI質問機能のローカル実行

`/ai/`では単発の質問をGeminiへ送り、質問・回答をNeonの`ai_qa_logs`へ保存し、最新20件の履歴を表示します。APIキーはサーバー環境変数だけで扱います。

必要な環境変数名は`AI_DEMO_ENABLED`、`AI_MOCK_ENABLED`、`GEMINI_API_KEY`、`GEMINI_MODEL`、`DATABASE_URL`です。値をGitやブラウザへ含めないでください。

- ローカル模擬回答: `AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=true`を設定し、`VERCEL_ENV`は設定しないでください。`AI_MOCK_ENABLED=true`が模擬するのはGeminiへの通信だけです。質問・回答の保存には引き続き`DATABASE_URL`、接続可能なNeon PostgreSQL、`ai_qa_logs`テーブルとINSERT権限が必要です。DB未設定またはDDL未適用の場合、質問送信は保存成功（HTTP 201）になりません。DDLにはCHECK式、PK列、indexの定義、`created_at` defaultの不一致を検出するcatalog照合を追加しました。実Neon上の定義がこのDDLと一致することは、この作業では再照合していません。レビュー・承認前にDDLを実DBへ適用しないでください。
- ローカルGemini: `AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=false`、`GEMINI_API_KEY`、`GEMINI_MODEL=gemini-3.5-flash-lite`、`DATABASE_URL`を設定してください。実リクエストはAPI利用料・DB書き込みを伴います。承認済みDDLの適用後に、手動で少数回だけ実施してください。

設定後に`pnpm dev`を起動します。自動検証は`pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm test`、`pnpm build`と、AI UIのPlaywrightテストで行います（下のコマンド一覧を参照）。

Gemini設定がない状態でもアプリと既存TODOは起動しますが、AI APIは安全なエラーを返します。ProductionではAI APIは常に停止します。実Neon保存の確認には、承認済みのAI履歴DDLを対象DBへ適用済みである必要があります。

2026-11-25、利用者から「ローカルで実Gemini APIに接続し、Express経由で回答を取得し、Neonを使ったAI質問アプリの動作確認を完了した」と報告を受けました。これは利用者による手動確認であり、自動テストやVercel環境の検証とは区別します。このセッションでは実Gemini/Neon接続を再実施していません。確認内容と未確認事項は[`docs/ai/test-results.md`](docs/ai/test-results.md)を参照してください。

### Vercel Preview運用

2026-11-18の匿名GETでは、確認できたPreviewデプロイURLの`/`、`/ai/`、`/api/ai/history`がVercel SSOへリダイレクトされました。これはそのデプロイと経路での保護確認です。Dashboard上の保護方式、例外URL、canonical Preview aliasの設定は確認できていません。これらをVercel Dashboardで確認するまでPreviewの`AI_DEMO_ENABLED`をtrueにしないでください。

確認手順: Vercel Dashboardで`vercel-study-app`を開き、**Settings > Deployment Protection**でPreviewの保護方式・対象範囲・例外を確認し、**Settings > Environment Variables**で各変数のEnvironment/Preview branch scopeを確認します。Previewだけで必要な`AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=false`、Gemini key/model、`DATABASE_URL`は、アクセス保護とDB分離を確認した後に適用します。秘密値自体を画面共有や資料に記録しないでください。

FunctionのNode.js runtime、Fluid Compute、Functionの実効`maxDuration`はVercel Dashboardを確認できず未確認です。**Settings > Build and Deployment > Node.js Version**でruntimeを、Projectの**Functions Settings > Fluid Compute**でFluid Computeを、Function詳細で実効durationを確認してください。Gemini SDKのHTTP timeoutは30秒で、DB保存と応答に別途時間が必要です。Functionの実効上限が不明の間、30秒処理が収まると判断しないでください。`vercel.json`は追加していません。

## AI会話アプリ V2（ローカル開発専用）

`/ai/v2/`では話題ごとの会話を作成・切替し、選択中の会話の最新20ターンを表示できます。追加質問には同一会話の保存済み最新5ターンをGeminiへ渡します。会話/ターンはV1の`ai_qa_logs`とTODO表を変更せず、V2専用`ai_v2_conversations` / `ai_v2_turns`へ保存します。

V2 APIは認証を実装していないため、`NODE_ENV=development`、`AI_V2_DEMO_ENABLED=true`、`VERCEL_ENV`未設定のすべてが揃ったローカル環境だけで有効です。Preview、Production、`NODE_ENV`不明/productionなどでは、flagに関係なくAPIは503 `DEMO_DISABLED`で停止します。V2は模擬Geminiを使わず、質問には実GeminiとDBが必要です。AI V1の`AI_DEMO_ENABLED` / `AI_MOCK_ENABLED`とは別設定です。

ローカル起動前に、`.env`等のGit管理外の環境へ`DATABASE_URL`、`GEMINI_API_KEY`、`GEMINI_MODEL`、`AI_V2_DEMO_ENABLED=true`を設定してください。シェルの`NODE_ENV=development`を明示し、`VERCEL_ENV`が存在しないことを確認してから`pnpm dev`を起動し、`http://localhost:3000/ai/v2/`を開きます。秘密値をコマンド履歴、画面共有、ログ、Gitへ出さないでください。キーやDB設定がない場合もアプリ/TODOは起動しますが、V2 APIはAIまたはDBエラーになります。

### V2 DDLの確認・適用

`sql/ai/040_create_ai_v2_tables.sql`は使い捨てPostgreSQL 16で新規作成・再実行・定義不一致時の停止を確認済みです。利用者報告ではNeonの`production` / `neondb`へDDLを適用し、定義照合も成功しています（CodexによるNeonへの接続・再照合ではありません）。今後別のDBへ適用する場合は、Neon Consoleで対象Project・branch・databaseを確認し、`information_schema`、`pg_get_constraintdef`、`pg_get_indexdef`、`pg_index`、`pg_get_expr`等でcolumns、identity/default、constraints、PK/FK、indexesを照合してください。同名オブジェクトの不一致時は停止し、既存テーブルを変更・削除しないでください。

DDL適用後の手動確認は、ローカル限定設定でV2画面から新規会話を作成し、質問を1回送信、HTTP 201と会話一覧/履歴を確認します。その後Neonでconversation id/titleと対応するturnのprompt/responseを読み取り、画面再読込後に一覧から同じ会話を再選択して再表示されることを確認します。Gemini実呼出しはAPI料金、Neon保存は永続変更を伴うため、対象と回数を確認したうえで利用者が実行してください。この作業では実Gemini/Neon結合を再試験していません。

#### 利用者によるローカル手動確認

利用者報告によるローカル手動確認では、`/ai/v2/`画面、会話作成、Gemini回答生成、過去会話を踏まえた追加質問、会話間の文脈分離、再読み込み後の再開、Neonへの保存、DDL定義照合、および一覧GET 200・作成POST 201・履歴GET 200・質問POST 201が成功しています。対象Neonは`production` / `neondb`との報告です。これは利用者の手動確認であり、自動テストや使い捨てPostgreSQL試験とは別の証跡で、Codexは再実施していません。Vercel Preview/ProductionでのV2 API動作、Vercel設定、DB rollbackは未確認です。詳細は[`docs/ai/v2/test-results.md`](docs/ai/v2/test-results.md)と[`sql/README.md`](sql/README.md)を参照してください。

V2の自動検証: `pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm test`、`pnpm build`、`pnpm exec playwright test tests/e2e/ai-v2.spec.ts`。PlaywrightはAPIをroute mockし、実Gemini/Neonへ通信しません。

### Production運用

Productionでは`VERCEL_ENV=production`により、`AI_DEMO_ENABLED=true`でも`POST /api/ai/ask`と`GET /api/ai/history`を503 `DEMO_DISABLED`で停止します。これはAI API単位の制御で、TODO V1/V2は独立しています。TASK-08ではSupertestでこの分岐を確認し、Productionデプロイの匿名GETはVercel SSOへリダイレクトされたため、アプリのProduction応答自体は確認できていません。ProductionへPOSTは行いません。

### 制限事項

- 履歴の保存期間と削除運用は未決定です。
- `ai_qa_logs`の実Neon DDLは未確認・未適用です。既存CHECK制約、PK列、index列順/方向、`created_at` defaultをcatalog関数で照合するレビューが必要です。
- V2のローカル実Gemini・Neon保存/履歴再開は利用者報告で成功していますが、Codexは再実施していません。Vercel Preview/ProductionでのV2動作、実DB rollback、実DBを使うTODO E2Eは未確認です。
- VercelのNode.js runtime、Fluid Compute、実効Function上限、環境変数scope、Dashboardの保護例外は未確認です。Previewアクセス保護が設定画面でも確認できるまでAIを有効化しないでください。
