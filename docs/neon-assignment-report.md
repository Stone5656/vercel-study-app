# Neon 接続と Vercel Preview 演習レポート

## リポジトリ・PR

- Repository: https://github.com/Stone5656/vercel-study-app
- 接続確認 PR #1: https://github.com/Stone5656/vercel-study-app/pull/1（2026-11-11 に main へマージ済み）
- 商品一覧 PR #2: main へマージ済み
- 使用ブランチ: `feature/neon-connection`、`feature/product-list`
- 主なコミット:
  - `772d462` Neonへのデータベース接続処理を追加
  - `fd81c1b` Neon接続確認と商品テーブル準備のSQLを追加

## デプロイ

- Vercel Production（正しい確認先）: https://vercel-study-app-seven.vercel.app
- 注: 以前に記録された `vercel-study-app-psi.vercel.app` は今回の Production 確認対象ではありません。
- Vercel Preview（PR #4、利用者手動確認）: https://vercel-study-eagdbjfwu-stone5656s-projects.vercel.app。V1/V2 と接続確認・商品一覧を正常確認済み。詳細は [TODO V2 最終テスト記録](todo/v2/04_test_results_v2.md) を参照。

## 動作確認

| 確認時点                                     | `/`      | `/api/db-check` | `/db-sample` |
| -------------------------------------------- | -------- | --------------- | ------------ |
| ローカル                                     | HTTP 200 | HTTP 200        | HTTP 200     |
| Preview（PR #4、利用者手動確認）             | 成功     | 成功            | 成功         |
| 誤ったホストでの過去確認（Production対象外） | 対象外   | 対象外          | 対象外       |
| Production（最終、利用者手動確認）           | 成功     | 成功            | 成功         |

## SQL 実行記録

- `sql/000_check_connection.sql` を先に実行。対象は Neon `production` ブランチ / `neondb`。
- `sql/010_setup_sample_products.sql` を続けて実行。利用者から、テーブル作成済み・商品3件登録済みと報告あり。
- 実行日: 2026-11-11（利用者報告。時刻は未確認）。ローカルの `/db-sample` でノート200円、ペン120円、消しゴム80円を確認。

## エラーと対応

- 過去に `vercel-study-app-psi.vercel.app` を対象にした際にエラーを観測したが、このホストは最終 Production の確認先ではなかった。正しい Production URL `https://vercel-study-app-seven.vercel.app` では利用者がマージ後の `/`、接続確認、商品一覧、V1/V2 の全機能を正常確認済み。詳細は [TODO V2 最終テスト記録](todo/v2/04_test_results_v2.md) を参照。

## 確認問題

### 1. SQL を GitHub に保存することと SQL Editor で実行することの違い

GitHub への保存は SQL ファイルをコード・教材資料として版管理するだけで、データベースには何も起きません。Neon SQL Editor で実行すると、選択中の Neon ブランチ / DB に対して SQL が実際に動き、テーブル作成や行の追加などの状態変更が発生します。

### 2. Preview で見えても、マージ前の Production で見えない理由

Preview は feature ブランチのコードを使った別の Vercel デプロイです。Production はその時点で `main` に反映済みのコードを実行するため、PR をマージ・デプロイするまでは `/db-sample` ルートが含まれず、表示できません。同じ DB を参照していても、実行中のアプリケーションコードが異なります。

### 3. Preview と Production の商品データは別々か

Git のコード管理、デプロイ環境、データベースの実体は別のものです。GitHub のブランチはコードの版を管理し、Vercel は Preview / Production ごとにそのコードをデプロイします。どのデータベースに接続するかは各 Vercel 環境の `DATABASE_URL` が決定します。両環境の `DATABASE_URL` が同じ Neon ブランチ・DB を指せば商品データは共有され、異なる接続先なら別データになります。今回の接続先が両環境で同一かは Vercel 設定の値を見ずに断定せず、利用者は教材設定で同じ DB としているとの前提を報告しています。
