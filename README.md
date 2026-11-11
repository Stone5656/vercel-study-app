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
