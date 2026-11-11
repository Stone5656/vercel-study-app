# TODO アプリ V1 テスト結果

## 実行情報

- Branch: `feature/todo-app`
- 検証時点の HEAD: `9bbcd01`（EJS画面コミット後。テスト記録コミットは後続）
- Neon: `production` / `neondb`（TODO テーブル作成は利用者報告）
- 検証日時: 2026-11-11 UTC（時刻はこの記録の作成時点）

## ローカル

| URL / 検証                                                        | 結果                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `http://localhost:3000/`                                          | 開発サーバー、本番ビルドとも HTTP 200                                       |
| `http://localhost:3000/api/db-check`                              | 開発サーバー、本番ビルドとも HTTP 200、`database: connected`                |
| `http://localhost:3000/db-sample`                                 | 開発サーバー、本番ビルドとも HTTP 200、ノート200円・ペン120円・消しゴム80円 |
| `http://localhost:3000/todo`                                      | 開発サーバー、本番ビルドとも HTTP 200。画面と ES module を確認              |
| `http://localhost:3000/api/v1/todos`                              | 開発サーバー、本番ビルドとも HTTP 200、`data: []`                           |
| Playwright CRUD                                                   | 成功。専用一意タイトルを登録し、完了に更新後、自分の作成行だけを削除        |
| `pnpm test`                                                       | 成功。19件、失敗0件                                                         |
| `pnpm exec playwright test --output=/tmp/todo-playwright-results` | 成功。2件、失敗0件                                                          |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`  | すべて成功                                                                  |
| `pnpm install --frozen-lockfile`                                  | 成功                                                                        |

通常の `pnpm test:e2e` は既存 `test-results/.last-run.json` の権限エラーで失敗しました。リポジトリ外の一時出力先を指定して再実行し、2件成功しました。既存テストアーティファクトは変更していません。

## Preview（マージ前）

- URL: 未確認（このブランチの Vercel Preview は未取得）
- `/`, `/api/db-check`, `/db-sample`, `/todo`, `/api/v1/todos`: 未実施
- Preview CRUD: 未実施

## Production（マージ前）

2026-11-11 UTC に `https://vercel-study-app-psi.vercel.app` を確認。

| URL             | 結果                                                    |
| --------------- | ------------------------------------------------------- |
| `/`             | HTTP 200                                                |
| `/api/db-check` | HTTP 503、`{"status":"error","database":"unavailable"}` |
| `/db-sample`    | HTTP 503                                                |
| `/todo`         | HTTP 404（今回の変更は未デプロイ）                      |
| `/api/v1/todos` | HTTP 404（今回の変更は未デプロイ）                      |

この Production 結果は、依頼時点での「既存機能が正常」との報告と一致しません。原因は Vercel 側の環境変数スコープまたは DB 到達性等の可能性がありますが、ログ・設定を取得できていないため未確定です。接続文字列の値は調査・記録していません。

## 要件別結果

| 要件                              | 結果                          | 根拠                                               |
| --------------------------------- | ----------------------------- | -------------------------------------------------- |
| REQ-01 一覧・0件                  | 成功                          | モック API テストとローカル Neon API が200で空配列 |
| REQ-02 登録                       | 成功                          | API テストとローカル Neon Playwright CRUD          |
| REQ-03 完了更新                   | 成功                          | API テストとローカル Neon Playwright CRUD          |
| REQ-04 削除                       | 成功                          | API テストで204本文なし、Playwright で自作行削除   |
| title欠落/型違い                  | 成功                          | 400 API テスト                                     |
| 空白のみ/101文字                  | 成功                          | 422 API テスト                                     |
| ID形式/不存在                     | 成功                          | 400/404 API テスト                                 |
| 不正JSON                          | 成功                          | 統一形式400 API テスト                             |
| DB利用不可                        | 成功                          | 接続エラー・未設定を503にするモックテスト          |
| 既存トップ / db-check / db-sample | Local 成功、Production 要調査 | Local 200、今回の Production は200/503/503         |

## 不具合と修正

- `/todo` が静的 `public/todo/` と競合し301リダイレクトになる回帰をテストで発見。TODO Router を静的配信より前に登録し、HTTP 200 で画面を表示するよう修正しました。
- DB 接続設定がない場合の API 応答を `DB_UNAVAILABLE` / 503 に統一しました。
- Playwright 標準出力先の権限エラーは一時出力先へ変更して回避しました。既存アーティファクトは変更していません。

## 設計との差分

- 設計どおり Router / Controller / Model を分離し、API、TodoApi、DB処理、テストを REQ-01～REQ-04 に対応させました。
- 静的ディレクトリ `/todo/` との競合を防ぐため、Router を `express.static` より先に登録しました。
- Preview と Production の検証は未完了です。テーブル構造の報告は受領済みですが、SQL Editor の出力を直接取得しておらず利用者報告として記録しています。
