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

| 要件                             | 状態     | 証跡                                                         |
| -------------------------------- | -------- | ------------------------------------------------------------ |
| REQ-V2-001 会話作成              | 一部実施 | Model/API mockでINSERT/DTO、入力境界確認。Neon未確認         |
| REQ-V2-002 一覧/再開             | 一部実施 | 一覧SQL/API mock確認。選択UIはTASK-V2-06                     |
| REQ-V2-003 履歴保存/最新20       | 一部実施 | Model最新20/順序と履歴API/404をmock確認。UI/Neon未確認       |
| REQ-V2-004 最新5往復のGemini文脈 | 一部実施 | SDK boundary mockで最新5・同一context/current question確認   |
| REQ-V2-005 入力/16KiB            | 一部実施 | title/parserに加え質問trim/Unicode境界をAPI mock確認         |
| REQ-V2-006 AI→DB commit→201/競合 | 一部実施 | API/Model mockでcommit待機、AI/DB失敗、context競合を確認     |
| REQ-V2-007 UI状態                | 一部実施 | 会話UI/質問送信状態、timeout/race/再送防止をroute mock確認   |
| REQ-V2-008 V2 DB分離             | 一部実施 | V2専用DDLとModel SQL/transaction mock確認。Neon未適用        |
| REQ-V2-009 XSS/秘密              | 一部実施 | UI mockでtitle/question/responseのtext描画・要素未生成確認   |
| REQ-V2-010 公開停止/回帰         | 一部実施 | ガード条件とModel呼出0をSupertest確認。V1/TODO回帰は最終TASK |
| REQ-V2-011 固定エラー契約        | 一部実施 | 作成/一覧/履歴APIの入力/parser/DB/404をSupertest確認         |

## 実環境確認（未実施）

- Neon DDL適用、実DB insert/select/rollback、対象branch/database catalog照合
- 実Gemini API通信/APIキー設定確認
- Vercel Preview/Production設定変更または実APIリクエスト
- 実DBを使うTODO E2E

実Neon/実Geminiの動作確認手順はREADMEと本設計に記載し、利用者の明示承認と対象環境確認後に別途行う。

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
- DDLはNeonへ適用していない。Neon branch/database catalog照合、既存データ整合性、実INSERT/履歴SELECTは未確認。
- V2 browser HTML/JavaScriptの自動静的テストでGemini SDK、`GEMINI_API_KEY`、`DATABASE_URL`が配信コードに存在しないこと、`innerHTML`未使用と`textContent`利用を確認。
- Supertestで全V2 APIがProduction相当環境で503 `DEMO_DISABLED`となり、Model/Service呼出0であることを確認。これはアプリmiddlewareの自動テストであり、Vercel Production実環境の確認ではない。

### REQ受入状況（mock/staticと実機を分離）

| REQ        | 自動検証                                                       | 実機/手動状態               |
| ---------- | -------------------------------------------------------------- | --------------------------- |
| REQ-V2-001 | API/Model mockで作成・trim・境界・DTO確認                      | Neon保存未確認              |
| REQ-V2-002 | API/UI mockで一覧・切替・reload後の再取得確認                  | Neonからの再開未確認        |
| REQ-V2-003 | Model/API/UI mockで最新20・順序・会話分離確認                  | Neon履歴未確認              |
| REQ-V2-004 | Gemini SDK mockで同一context最新5 + current prompt確認         | 実Gemini未実施              |
| REQ-V2-005 | Supertest/Playwrightでtitle/prompt/JSON解析/byte/codepoint境界 | 実環境未確認                |
| REQ-V2-006 | deferred save/rollback/error/context conflict mock確認         | Neon transaction未確認      |
| REQ-V2-007 | Playwrightで会話・送信・timeout・race状態確認                  | 実Neon UI未確認             |
| REQ-V2-008 | DDL catalog照合とModel transaction mock確認                    | Neon未適用                  |
| REQ-V2-009 | 静的検査・XSS Playwright route fixture・固定エラー確認         | 外部設定/デプロイ未確認     |
| REQ-V2-010 | 全V2 endpointのProduction guard/呼出0とTODO/V1 server回帰確認  | Vercel設定/実デプロイ未確認 |
| REQ-V2-011 | API status/codeと固定エラーのSupertest確認                     | 実環境未確認                |

### 未完了の実環境試験

- 利用者が対象Neon Project/branch/databaseを確認し、DDLのcatalog出力と差分をレビュー・承認してからDDLを適用する。
- DDL適用後、ローカル専用guardの下でGemini質問を少数回実行し、保存されたturnと画面再読込後の再表示を確認する。
- Vercel runtime/Function上限、Preview Protection、Vercel環境変数scopeは未確認。V2は公開系で停止するため、これらの確認だけでAPI有効化される設計ではない。
- 保存期間、会話削除、ページネーション、認証/ユーザー分離は未実装/未決定。認証なしのV2 APIを公開してはならない。
