# Neon 接続と Vercel Preview 演習レポート

## リポジトリ・PR

- Repository: https://github.com/Stone5656/vercel-study-app
- 接続確認 PR #1: https://github.com/Stone5656/vercel-study-app/pull/1（2026-11-11 に main へマージ済み）
- 商品一覧 PR #2: 作成前
- 使用ブランチ: `feature/neon-connection`、`feature/product-list`
- 主なコミット:
  - `772d462` Neonへのデータベース接続処理を追加
  - `fd81c1b` Neon接続確認と商品テーブル準備のSQLを追加

## デプロイ

- Vercel Production: https://vercel-study-app-psi.vercel.app
- Vercel Preview: https://vercel-study-l2w9p7pc5-stone5656s-projects.vercel.app（GitHub deployment status は success。Preview Protection により直接アクセスは HTTP 302、各ページの結果は未確認）

## 動作確認

| 確認時点               | `/`                                   | `/api/db-check`                       | `/db-sample`                       |
| ---------------------- | ------------------------------------- | ------------------------------------- | ---------------------------------- |
| ローカル               | 既存テストで HTTP 200 を確認          | 実 DB 確認待ち                        | 実 DB 確認待ち                     |
| Preview（マージ前）    | 未確認                                | 未確認                                | 未確認                             |
| Production（マージ前） | HTTP 500 `FUNCTION_INVOCATION_FAILED` | HTTP 500 `FUNCTION_INVOCATION_FAILED` | 未確認（当時のコードにルートなし） |
| Production（マージ後） | 未確認                                | 未確認                                | 未確認                             |

## SQL 実行記録

- `sql/000_check_connection.sql` を先に実行。対象は Neon `production` ブランチ / `neondb`。
- `sql/010_setup_sample_products.sql` を続けて実行。利用者から、テーブル作成済み・商品3件登録済みと報告あり。
- 実行日: 2026-11-11（利用者報告。時刻は未確認）。ローカルの `/db-sample` でノート200円、ペン120円、消しゴム80円を確認。

## エラーと対応

- Production の `/` と `/api/db-check` が HTTP 500 `FUNCTION_INVOCATION_FAILED`。原因は Vercel の Function Logs を確認できておらず未確定。`DATABASE_URL` 未設定時に DB モジュールの初期化で Express アプリ全体がロード失敗する可能性を切り分け候補とし、DB 接続設定の検証を DB 利用ルート内に移してトップページは表示可能にする変更を実装。Vercel Function Logs は未確認のため、Production の根本原因確定と修正反映は未完了。Preview も Vercel Protection により HTTP 302 となり、実アプリの確認は未完了。

## 確認問題

### 1. SQL を GitHub に保存することと SQL Editor で実行することの違い

GitHub への保存は SQL ファイルをコード・教材資料として版管理するだけで、データベースには何も起きません。Neon SQL Editor で実行すると、選択中の Neon ブランチ / DB に対して SQL が実際に動き、テーブル作成や行の追加などの状態変更が発生します。

### 2. Preview で見えても、マージ前の Production で見えない理由

Preview は feature ブランチのコードを使った別の Vercel デプロイです。Production はその時点で `main` に反映済みのコードを実行するため、PR をマージ・デプロイするまでは `/db-sample` ルートが含まれず、表示できません。同じ DB を参照していても、実行中のアプリケーションコードが異なります。

### 3. Preview と Production の商品データは別々か

Git のコード管理、デプロイ環境、データベースの実体は別のものです。GitHub のブランチはコードの版を管理し、Vercel は Preview / Production ごとにそのコードをデプロイします。どのデータベースに接続するかは各 Vercel 環境の `DATABASE_URL` が決定します。両環境の `DATABASE_URL` が同じ Neon ブランチ・DB を指せば商品データは共有され、異なる接続先なら別データになります。今回の接続先が両環境で同一かは Vercel 設定の値を見ずに断定せず、利用者は教材設定で同じ DB としているとの前提を報告しています。
