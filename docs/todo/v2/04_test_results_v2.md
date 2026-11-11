# TODO アプリ V2 テスト結果

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

## Preview（マージ前）

- URL / deployment status: 未確認（ブランチ Push 前）
- V1/V2 routes、CRUD、priority、filters: 未実施

## Production（マージ前）

2026-11-11 UTC に `https://vercel-study-app-psi.vercel.app` を確認。

| URL             | 結果                      |
| --------------- | ------------------------- |
| `/`             | 200                       |
| `/api/db-check` | 503、database unavailable |
| `/db-sample`    | 503                       |
| `/todo`         | 200                       |
| `/api/v1/todos` | 503 `DB_UNAVAILABLE`      |
| `/todo-v2`      | 404（V2未デプロイ）       |
| `/api/v2/todos` | 404（V2未デプロイ）       |

V1 のアプリコードは動作していますが Production の DB 接続ができていません。Vercel の環境変数設定または接続先状態が原因候補ですが、Vercel 設定・Function Logs にアクセスできておらず原因未確定です。秘密情報は取得していません。

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
- Production の V1 DB route は503。コード変更を加えず、Vercel 側確認待ちとして記録。

## 設計との差分・未実施

- Router → Controller → Model 分離、共有Pool、V2専用テーブル/API/UI の設計どおり。
- Preview と Production の V2 検証、PR merge 後の本番確認は未実施。
- Preview Protection があればユーザーの認証済みブラウザで操作確認が必要。
