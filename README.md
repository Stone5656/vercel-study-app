# vercel-study-app

Express、TypeScript、EJSを使用したWebアプリケーションです。

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
