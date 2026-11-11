# TODO アプリ V2 テスト結果

- Branch: `feature/todo-v2`
- Pull Request: https://github.com/Stone5656/vercel-study-app/pull/4（マージ済み）
- マージコミット: `10e42a3b61d84ee3f0e49eeaa07ec29d0d94be00`
- 最終 Git 状態: `main` と `origin/main` は同じマージコミット

## 実装内容

- V2専用 `v2_todo_tasks` / `/api/v2/todos` / `TodoApiV2` / `/todo-v2` を追加。
- `priority` の low/normal/high、default normal、completed/priority の AND 絞り込み、V2 CRUD を実装。
- V1 routes、V1 `todo_tasks`、V1 DTO/画面の仕様変更なし。

## SQL

- Neon Branch `production` / Database `neondb`。
- 2026-11-11 利用者報告: SQL 実行成功。5カラム、PRIMARY KEY、CHECK、priority DEFAULT normal、初期0件を確認。V1 `todo_tasks` の存在も確認。
- SQL Editor の直接出力は取得しておらず、利用者報告として記録。

## Local

検証日時: 2026-11-11 06:49 UTC 頃。

| URL / 確認                              | 結果                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `http://localhost:3000/`                | 開発サーバー・本番ビルドとも200                                    |
| `/api/db-check`                         | 開発サーバー・本番ビルドとも200、database connected                |
| `/db-sample`                            | 開発サーバー・本番ビルドとも200、教材の3商品表示                   |
| `/todo`                                 | 開発サーバー・本番ビルドとも200                                    |
| `/api/v1/todos`                         | 開発サーバー・本番ビルドとも200、空配列                            |
| `/todo-v2`                              | 開発サーバー・本番ビルドとも200                                    |
| `/api/v2/todos`                         | 開発サーバー・本番ビルドとも200、空配列                            |
| Server/API tests                        | 40件成功                                                           |
| Playwright                              | 3件成功（home、V1 CRUD、V2 priority/filter/CRUD/V1とのデータ分離） |
| typecheck / lint / format:check / build | 成功                                                               |

E2E は `pnpm exec playwright test --output=/tmp/todo-v2-e2e-final` で実行。初回 V2 E2E は、ポート3000の古い `pnpm start` を Playwright が再利用して失敗。古いプロセスを停止し、最新サーバーで再実行して全3件成功しました。既存データを消去せず、E2E が作成した自分の V1/V2 データだけを削除しました。

## Preview（マージ前）— 利用者による手動確認

- URL: https://vercel-study-eagdbjfwu-stone5656s-projects.vercel.app
- 既存トップページ、`/api/db-check`、`/db-sample`、V1 `/todo`・`/api/v1/todos`、V2 `/todo-v2`・`/api/v2/todos`: すべて正常動作。
- V2 TODO 登録、low / normal / high の優先度設定・変更、完了状態更新、completed と priority の単独・組み合わせ絞り込み、削除: すべて成功。
- V1 CRUD: 成功。
- V1 / V2 データ分離: 成功。
- 確認者: 利用者。Codex は Preview Protection のため匿名確認では HTTP 302 のみを観測しており、Preview の実操作を行っていない。

## Production（マージ後）— 利用者による手動確認

- 正しい Production URL: https://vercel-study-app-seven.vercel.app
- `/`: 正常。
- `/api/db-check`: 正常。
- `/db-sample`: 正常。
- `/todo`、`/api/v1/todos` および V1 CRUD: 正常。
- `/todo-v2`、`/api/v2/todos` および V2 CRUD、優先度変更、完了状態更新、単独・組み合わせ絞り込み: 正常。
- V1 / V2 データ分離: 正常。
- 確認者: 利用者。手動確認の詳細な HTTP status code は報告されていないため記載していない。
- `DATABASE_URL` が Production に設定済みとの確認を利用者から受領。

### URL の訂正に関する履歴

以前の自動確認で使用した `https://vercel-study-app-psi.vercel.app` は今回の Production 確認対象ではない。そこで得た503等の結果は Production の最終結果として扱わず、正しいホストでの上記利用者確認を最終結果とする。

## V2 要件別

| 機能                                   | 結果 | 検証                                           |
| -------------------------------------- | ---- | ---------------------------------------------- |
| GET・空配列・条件なし                  | 成功 | モック API と実 Neon local                     |
| completed / priority 単独・AND         | 成功 | モック API、placeholder builder、実 DB E2E     |
| POST priority 省略 normal              | 成功 | API test                                       |
| POST low/normal/high                   | 成功 | API test                                       |
| PATCH 完了/priority/両方               | 成功 | API test と E2E                                |
| DELETE 204本文なし                     | 成功 | API test と E2E                                |
| title/priority/completed/ID validation | 成功 | API test                                       |
| 空 PATCH / 不正JSON / DB unavailable   | 成功 | API test                                       |
| V1/V2 data separation                  | 成功 | E2E でV1だけの記録がV2一覧に現れないことを確認 |

## 不具合と修正

- V2 初回 E2E が古いサーバー再利用で V2 route を見つけられず失敗。既存 `pnpm start` を停止し、最新コードの dev server で再実行して全件成功。
- 以前の確認で Production と誤認したホストに対する応答を記録していた。最終確認先は利用者指定の `https://vercel-study-app-seven.vercel.app` であり、そこでの V1 / V2 動作は利用者の手動確認ですべて成功。アプリコードの修正は不要でした。

## 設計との差分・未実施

- Router → Controller → Model 分離、共有 Pool、V2 専用テーブル/API/UI の設計どおり。
- Local の自動テストと、Preview / Production の利用者による手動検証を区別して記録。
- Preview / Production での手動操作に対する詳細な status code、Vercel のログは取得していない。
