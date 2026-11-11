# TODO アプリ V2 実装手順書

| 工程          | 対象ファイル                                             | 作業内容                                                | 確認コマンド                                                                | 期待結果                          | 問題発生時の調査                                       |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| 1. V1回帰     | existing V1 app/tests                                    | routes、V1 CRUD、画面、DB接続の現状を確認               | `pnpm typecheck`, `pnpm test`, Playwright                                   | V1 基準機能に失敗なし             | failing test、V1 model/route                           |
| 2. DB追加     | `sql/todo/021_create_todo_tasks_v2.sql`, `sql/README.md` | V2専用 table SQL を追加・Neon Editor で適用、実行記録   | Neon SQL Editor                                                             | V2 table schema、初期0件          | 接続先、information_schema。既存データに手を加えず停止 |
| 3. V2 API     | `src/apps/todo/v2/*`, `src/app.ts`, API tests            | V2 GET/POST/PATCH/DELETE と validation/filter           | `pnpm test`, `pnpm typecheck`                                               | 契約どおりの status/JSON、V1不変  | fake model、SQL params、route mount                    |
| 4. TodoApi    | `public/todo/todo-v2.js`, declaration, unit test         | Fetch API の4 method/query/error                        | `pnpm test`                                                                 | URL/method/body/204 correct       | network mock、response parsing                         |
| 5. V2画面     | `views/todo/v2.ejs`, `public/todo/todo-v2.js`, app tests | priority/filter UI、safe rendering、loading/error/empty | `pnpm test`, `pnpm build`                                                   | `/todo-v2` と静的 module が使える | Express route order、views/public paths                |
| 6. Local      | tests, `docs/todo/v2/04_test_results_v2.md`              | 静的/API/E2E と全 V1/V2 URL                             | `pnpm install --frozen-lockfile`; typecheck/lint/format/test/build/test:e2e | V1回帰とV2 CRUD/filter成功        | logs/status、temporary Playwright output               |
| 7. Preview    | report                                                   | Ready deployment で全ルートとCRUDを確認                 | Preview browser                                                             | auth後に V1/V2 正常               | Vercel deployment、DB env scope、logs                  |
| 8. PR         | GitHub                                                   | `feature/todo-v2` → `main` PR、仕様/検証を記載          | PR checks/reviews                                                           | checks 成功、Preview 検証済み     | CI/review/deployment status                            |
| 9. Production | report                                                   | 承認後 merge/deploy、V1/V2 全機能を確認                 | Production browser/API                                                      | 本番 V1/V2 と商品・DB確認         | Vercel logs、Neon connection                           |

## 仕様整合確認

V2-REQ-01～04 は API 設計・Model 処理・TodoApiV2 メソッド・テストと同じ順で対応する。優先度の許可値/default、filter の AND 条件、エラー status/code は要件書と設計書で一致する。V1 には新規 route mount 以外の変更を加えない。
