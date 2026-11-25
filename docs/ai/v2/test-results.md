# AI会話アプリ V2 試験結果

## 試験方針

- V2実装branch: `feature/ai-app-v2-implementation`
- 基点main: `42db3e39e4f1eea117b0c2a74d6b8b61d55f8966`（PR #10 squash merge）
- 実Gemini通信・Neon DDL適用/読み書きは禁止。Gemini SDK境界、DB Modelは依存注入mockを基本とする。
- DDLは使い捨てPostgreSQLでのみ試験し、Neonの結果と同一視しない。
- 実DB依存のTODO E2Eは自動実行しない。TODO server testsは回帰実行する。
- 合格は実施した主体・方法の範囲だけを指す。未試験を成功扱いしない。

## TASK-V2-01 ベースライン（2026-11-25）

| コマンド            | 結果                                |
| ------------------- | ----------------------------------- |
| `pnpm lint`         | 成功                                |
| `pnpm typecheck`    | 成功                                |
| `pnpm format:check` | 成功                                |
| `pnpm test`         | 70/70成功、9 suites、fail 0、skip 0 |
| `pnpm build`        | 成功                                |
| `git diff --check`  | 成功                                |

## TASK-V2-02 DDL・Model（2026-11-25）

- `sql/ai/040_create_ai_v2_tables.sql`を使い捨てDocker PostgreSQL 16で新規適用、再実行、同名CHECK制約不一致を試験した。新規作成・冪等再実行はいずれも成功。不一致時は例外で停止し、トランザクションrollbackで同時作成されかけた欠落テーブルも残らないことを確認した。
- Model単体テストはNode.js Test Runnerで7/7成功。会話作成・一覧、最新20件の昇順返却、最新5件の文脈/version、transaction commit、context競合rollback、DB失敗rollback、安全なDB例外変換を依存注入mockで検証した。
- NeonへのDDL適用・接続・データ変更は未実施。使い捨てPostgreSQLの結果を実Neon確認済みとは扱わない。
- `pnpm typecheck`は成功。TASK-V2-02完了時のlint/format/全server test/buildは、後続タスクと最終統合時にも再実行する。

## TASK-V2-03 会話作成/一覧API・公開ガード（2026-11-25）

- Supertestで作成201/保存済みDTO、trim、Unicodeコードポイント1/50境界、空白/欠落/型違い/51文字、invalid JSON、16 KiB超過、非JSON、空一覧、DB障害固定503を検証。
- 公開ガードは`NODE_ENV=development`かつ`AI_V2_DEMO_ENABLED=true`かつ`VERCEL_ENV`未設定の場合のみ通過。NODE_ENV未設定/test/production、flag false、Vercel Preview/Productionで503 `DEMO_DISABLED`かつModel呼出0を検証。ガードがparserより先に実行されることも確認。
- APIテスト8/8成功。`pnpm lint`、`pnpm typecheck`成功。TODO/V1回帰と全suiteは後続/最終統合で再実行する。
- 実Neon、Gemini、Vercel設定の確認は未実施。

## TASK-V2-04 選択会話の履歴API（2026-11-25）

- Supertest 6/6成功。ID 1およびPostgreSQL INTEGER上限2,147,483,647を受理。0、先頭ゼロ、符号、指数表記、上限超過、安全整数超過をDB照会前に400で拒否。
- 有効な会話の履歴をModel順で返却し、空履歴200と存在しない会話404を区別。Modelの固定DB障害503と想定外500を確認。
- 最新20ターン/同時刻ID tie-break/古い順DTOはTASK-V2-02 Model SQL/mockで確認済み。Neonは未実施。

## TASK-V2-05 直近5往復Gemini質問API（2026-11-25）

- Gemini SDK境界をfake clientでmock。直近5ターンは古い順のuser/model roleで送り、current promptを末尾のuserとして追加。6件目以前の履歴は送らず、model、max tokens 1024、30秒HTTP timeout、retry attempts 1、automaticContinuation false、automaticFunctionCalling disabledを検証。
- HTTP/Service tests 10/10成功。trim/Unicode 2,000境界、AI失敗/空回答時の保存0、DB障害503、context競合409、conversation不在、DB保存Promise完了前に201が返らないことを確認。
- 実Gemini API通信・API key実機確認・Neonへの保存は未実施。

## TASK-V2-06 会話管理UI（2026-11-25）

- `pnpm exec playwright test tests/e2e/ai-v2.spec.ts --output=/tmp/ai-v2-task06-results`: Chromium 7/7成功。
- route mockで会話一覧/新規作成/選択切替/各会話履歴の分離、loading/empty、遅れて到着した古い履歴応答の破棄、固定された公開停止案内、XSS風タイトル/質問/回答のプレーンテキスト表示、未実装質問フォームのdisabled/non-submitを確認。
- 実Neon/Gemini/Vercel環境は未確認。

## TASK-V2-07 追加質問UI（2026-11-25）

- V2 Playwright route-mock suite: 17/17成功（Chromium）。既存会話管理7件を維持し、質問送信と状態テストを追加。
- 正常201後の回答描画/入力クリア/GET再取得、POST成功後のGET障害で回答を残し警告、空白/2,001コードポイントをPOSTなしで拒否、JSON bytes検査、送信中の連打/会話選択/作成防止、既知HTTP error codeの固定文、失敗時入力保持を確認。
- Playwright ClockでPOST 45秒、履歴GET 15秒の期限を進め、再送なし、POSTは保存結果不明を表示して入力保持、履歴timeoutでは回答保持・履歴loading解除・操作復帰を確認。
- 不正/parse不能201とネットワーク失敗も「保存の可能性あり」として自動再送なし。質問/回答のHTML風文字列はtextContentで表示されDOM要素を生成しない。
- 外部Gemini、実Neon、Preview/Productionの実環境動作は未実施。

TASK-V2-01のbaseline時点ではExpress 5/TypeScript ESM、`src/app.ts`、共有`requirePool()`、V1 AI router、TODO V1/V2が存在し、V2コード/DDLはなかった。既存実機Neon/Gemini、Vercel Dashboard、実DB TODO E2Eは未確認。

## 要件別試験状況

| 要件                             | 状態     | 証跡                                                                         |
| -------------------------------- | -------- | ---------------------------------------------------------------------------- |
| REQ-V2-001 会話作成              | 一部実施 | API/Model mockと利用者手動確認。Neon `production` / `neondb`への保存成功報告 |
| REQ-V2-002 一覧/再開             | 一部実施 | API/UI mockと利用者の再読込後再開成功報告                                    |
| REQ-V2-003 履歴保存/最新20       | 一部実施 | Model/API/UI mockとNeon保存・履歴確認成功の利用者報告                        |
| REQ-V2-004 最新5往復のGemini文脈 | 一部実施 | SDK mockと実Gemini追加質問成功の利用者報告                                   |
| REQ-V2-005 入力/16KiB            | 一部実施 | title/parserに加え質問trim/Unicode境界をAPI mock確認                         |
| REQ-V2-006 AI→DB commit→201/競合 | 一部実施 | API/Model mockでcommit待機/rollback/競合を確認。利用者は実保存成功を報告     |
| REQ-V2-007 UI状態                | 一部実施 | route mockと利用者の画面/会話分離/再開成功報告                               |
| REQ-V2-008 V2 DB分離             | 一部実施 | disposable DDL試験とNeon適用・定義照合成功の利用者報告                       |
| REQ-V2-009 XSS/秘密              | 一部実施 | UI mockでtitle/question/responseのtext描画・要素未生成確認                   |
| REQ-V2-010 公開停止/回帰         | 一部実施 | ガード条件とModel呼出0をSupertest確認。V1/TODO回帰は最終TASK                 |
| REQ-V2-011 固定エラー契約        | 一部実施 | 作成/一覧/履歴APIの入力/parser/DB/404をSupertest確認                         |

## 利用者によるローカル手動確認（実施日時未記録）

対象はローカル環境。Neon Branch `production`、Database `neondb`。利用者報告ではDDL適用済みで、DDL定義照合も成功した。

| 手動試験                     | 利用者報告の結果 | 範囲・注記                                         |
| ---------------------------- | ---------------- | -------------------------------------------------- |
| V2画面 `/ai/v2/`             | 成功             | ローカル画面を利用                                 |
| 会話作成                     | 成功             | 手動操作                                           |
| Gemini回答生成               | 成功             | 実環境での利用者確認                               |
| 過去の会話を踏まえた追加質問 | 成功             | 同一会話の追加質問                                 |
| 会話間の文脈分離             | 成功             | 利用者報告                                         |
| 再読み込み後の会話再開       | 成功             | 利用者報告                                         |
| Neonへの保存                 | 成功             | Neon `production` / `neondb`への保存確認との報告   |
| DDL定義照合                  | 成功             | 利用者報告。Codexはcatalogを取得・再照合していない |
| 会話一覧 GET                 | HTTP 200、成功   | 利用者がNetwork statusを確認                       |
| 会話作成 POST                | HTTP 201、成功   | 利用者がNetwork statusを確認                       |
| 履歴取得 GET                 | HTTP 200、成功   | 利用者がNetwork statusを確認                       |
| 質問送信 POST                | HTTP 201、成功   | 利用者がNetwork statusを確認                       |

これは利用者による手動確認であり、Codexが実Gemini/Neonへ接続・通信して再現した結果ではない。実施日時、HTTP response body、保存行のIDや内容は報告されていないため追記しない。質問本文・回答本文・秘密値を資料へ転載しない。

## 実環境確認（残存未確認事項）

- Vercel Preview/ProductionのV2 API停止を含む設定・実環境確認。V2は公開環境で有効化していない。
- Neon rollback/障害時の実DB動作。使い捨てPostgreSQLでの検証とは別。
- 実DBを使うTODO E2E。既存データ変更を避けるため未実施。
- 手動確認の実施日時、response body、保存IDなど利用者から報告されていない証跡。

mock自動テスト、使い捨てPostgreSQL DDL試験、利用者のローカル手動試験は別種の証跡として扱う。Vercel設定や公開APIの状態を手動試験結果から推定しない。

## TASK-V2-08 最終統合（2026-11-25）

### 最終自動検証

実装branchのローカルNode.js/Chromium環境で実施。すべて外部Neon/Gemini通信なし。

| コマンド                                                                                                                                                        | 実測結果                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm lint`                                                                                                                                                     | 成功                                |
| `pnpm typecheck`                                                                                                                                                | 成功                                |
| `pnpm format:check`                                                                                                                                             | 成功                                |
| `pnpm test`                                                                                                                                                     | 103/103成功、全server suite、fail 0 |
| `pnpm build`                                                                                                                                                    | 成功                                |
| `pnpm exec playwright test tests/e2e/ai-history.spec.ts tests/e2e/ai-ask.spec.ts tests/e2e/ai-v2.spec.ts tests/e2e/home.spec.ts --output=/tmp/ai-v2-task08-e2e` | 55/55成功、Chromium、fail 0         |
| `git diff --check`                                                                                                                                              | 成功                                |

V2 Playwright suiteは17/17成功。既存AI V1履歴/質問UIとTOPを含むE2E合計55件はすべてroute mockまたは静的表示で確認した。DBへ書き込むTODO V1/V2 Playwright E2Eは意図的に実行せず、既存TODOのSupertest server testsを実行して回帰確認した。

### DDL試験と静的安全確認

- Docker使い捨てPostgreSQL 16でDDL新規作成・再実行、同名かつ正しい式だが`NOT VALID`のCHECK制約時の停止、同名indexの列方向不一致時の停止を確認。失敗時はトランザクションrollbackされ、既存の不一致定義が保持されることを確認。
- 使い捨てPostgreSQL 16のDDL試験と、利用者報告によるNeon `production` / `neondb`へのDDL適用・定義照合成功を区別する。CodexはNeonへ接続しておらず、利用者報告以上のcatalog/既存データを検証していない。
- V2 browser HTML/JavaScriptの自動静的テストでGemini SDK、`GEMINI_API_KEY`、`DATABASE_URL`が配信コードに存在しないこと、`innerHTML`未使用と`textContent`利用を確認。
- Supertestで全V2 APIがProduction相当環境で503 `DEMO_DISABLED`となり、Model/Service呼出0であることを確認。これはアプリmiddlewareの自動テストであり、Vercel Production実環境の確認ではない。

### REQ受入状況（mock/staticと実機を分離）

| REQ        | 自動検証                                                       | 実機/手動状態                                                      |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| REQ-V2-001 | API/Model mockで作成・trim・境界・DTO確認                      | 会話作成/Neon保存成功（利用者報告、`production` / `neondb`）       |
| REQ-V2-002 | API/UI mockで一覧・切替・reload後の再取得確認                  | 会話間分離/再読込再開成功（利用者報告）                            |
| REQ-V2-003 | Model/API/UI mockで最新20・順序・会話分離確認                  | Neon保存/履歴取得成功（利用者報告）                                |
| REQ-V2-004 | Gemini SDK mockで同一context最新5 + current prompt確認         | Gemini回答/追加質問成功（利用者報告）                              |
| REQ-V2-005 | Supertest/Playwrightでtitle/prompt/JSON解析/byte/codepoint境界 | 実環境未確認                                                       |
| REQ-V2-006 | deferred save/rollback/error/context conflict mock確認         | Neon transaction未確認                                             |
| REQ-V2-007 | Playwrightで会話・送信・timeout・race状態確認                  | V2画面/再開/会話分離成功（利用者報告）                             |
| REQ-V2-008 | DDL catalog照合とModel transaction mock確認                    | Neon DDL適用/定義照合成功（利用者報告）                            |
| REQ-V2-009 | 静的検査・XSS Playwright route fixture・固定エラー確認         | 外部設定/デプロイ未確認                                            |
| REQ-V2-010 | 全V2 endpointのProduction guard/呼出0とTODO/V1 server回帰確認  | Vercel設定/実デプロイ未確認                                        |
| REQ-V2-011 | API status/codeと固定エラーのSupertest確認                     | 一覧GET 200、作成POST 201、履歴GET 200、質問POST 201（利用者報告） |

### 未完了の実環境試験

- 利用者報告ではNeon `production` / `neondb`へのDDL適用/照合、保存、再読込、4 APIのstatusは成功。Codexによる独立再検証はしていない。
- Vercel runtime/Function上限、Preview Protection、Vercel環境変数scopeは未確認。V2は公開系で停止するため、これらの確認だけでAPI有効化される設計ではない。
- Vercel Preview/Productionの設定・実環境確認、実DB rollback、実DB依存TODO E2Eは未確認。保存期間、会話削除、ページネーション、認証/ユーザー分離は未実装/未決定。認証なしのV2 APIを公開してはならない。
