# AI質問機能 試験結果

## 1. 記録規則

結果区分は「自動テスト」「モック」「実DB」「実Gemini」「手動」のどれで確認したかを明記する。未実施項目は合格としない。実APIへの大量アクセスは行わない。

## 2. 変更前ベースライン（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、40 tests / 5 suites |
| `pnpm build`        | 成功                      |

`.env`は読み取っていない。実DB、実Gemini、Preview、Productionへの通信は実施していない。

## 3. AI機能テスト一覧

| ID  | テスト         | 方法                         | 状態     | 記録                                                                                                |
| --- | -------------- | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| T01 | 正常質問       | Supertest/fake Service+Model | 合格     | 201と保存DTO、Service→save順、およびsave未完了中に201が返らないことを確認                           |
| T02 | 再読込         | E2E/モック                   | 合格     | TASK-05でPlaywright page reload後に履歴API mockを再取得。実DB永続化は未確認                         |
| T03 | 履歴0件        | Supertest/モック             | 合格     | 200、`success: true`、空配列を確認                                                                  |
| T04 | 空白入力       | fake Service/Model           | 合格     | Service/Model未呼出しを確認                                                                         |
| T05 | 2,001文字      | fake Service/Model           | 合格     | 2,000絵文字を受理、2,001コードポイントを400で拒否                                                   |
| T06 | 不正JSON       | Supertest                    | 合格     | 400 `INVALID_JSON`                                                                                  |
| T07 | 16KiB超過      | Supertest                    | 合格     | 413 `PAYLOAD_TOO_LARGE`                                                                             |
| T08 | 非JSON         | Supertest                    | 合格     | 415 `UNSUPPORTED_MEDIA_TYPE`                                                                        |
| T09 | DB保存失敗     | fake Model                   | 合格     | 503 `DB_UNAVAILABLE`、成功itemなし                                                                  |
| T10 | AI失敗         | fake Service                 | 合格     | 502、DB保存なし                                                                                     |
| T11 | AI空回答       | fake Service                 | 合格     | 502、DB保存なし                                                                                     |
| T12 | オフライン     | Playwright mock              | 合格     | POST network abort時に固定案内、入力保持、送信UI復帰、自動再送なし                                  |
| T13 | 連打           | Playwright mock              | 合格     | 二度目のsubmit eventを送信中フラグで無視し、POST 1回を確認                                          |
| T14 | HTML風文字列   | Playwright mock              | 合格     | 質問・回答双方でDOM要素生成とscript/event実行がない                                                 |
| T15 | デモ停止       | Supertest                    | 合格     | 未設定/falseとProductionを503、Production以外のtrueを後続へ通すことを自動確認                       |
| T16 | 秘密管理       | 静的確認+自動テスト          | 合格     | publicにAPI key/DB URL/SDK識別子なし、innerHTML代入なし、Service未設定時安全失敗                    |
| T17 | 履歴21件以上   | Model/E2E mock               | 合格     | Model結果・UI表示とも20件に制限。実DBデータでは未確認                                               |
| T18 | 同日時の履歴   | SQL静的確認                  | 静的合格 | 固定SELECTの`created_at DESC, id DESC`を確認。DBでの実行・同時刻行は未確認                          |
| T19 | Geminiへの入力 | SDK境界mock                  | 合格     | fake clientへの入力は現在のpromptのみ。実Gemini通信は未実施                                         |
| T20 | TODO回帰       | server自動テスト             | 合格     | TASK-07時点の70 server tests成功。AI停止中のTODO/JSON契約もfake modelで確認。DB依存TODO E2Eは未実施 |

T01〜T15、T17、T19、T20の「合格」は記載した自動テスト/モック/静的確認の範囲に限る。実Neon検証済みを意味しない。実DB・実Geminiの項目は本タスクでも未実施。

## V1最終統合確認の利用者報告（2026-11-25）

| 区分                         | 結果                                 | 根拠と範囲                                                                                                          |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 利用者によるローカル手動確認 | 利用者報告では完了                   | 実Gemini API接続、Express経由の回答取得、Neonを利用したAI質問アプリの動作確認。このセッションでは再実施していない。 |
| 自動サーバーテスト           | TASK-08時点70/70成功。今回改めて実行 | Supertest/fake Service・Modelを含む。実Gemini/Neon試験とは別。                                                      |
| 自動ブラウザテスト           | TASK-08時点37/37成功。今回改めて実行 | Playwright route mock。実Gemini/Neonを呼ばない。                                                                    |
| Vercel実環境                 | 未確認                               | Node runtime、Function duration、Preview protection設定値、Production API応答は未確認。                             |
| Neon catalog定義照合         | 未確認                               | DDL検証の修正は静的レビューのみ。実DBのCHECK/PK/index/defaultはこのセッションで照合していない。                     |
| 実DB依存TODO E2E             | 未実施                               | AI質問機能のローカル動作報告とは別の回帰範囲。                                                                      |

手動確認報告には実行日時、質問内容、HTTP status、対象Neon branch/database、catalog照合結果の証跡が含まれていない。推測で補完せず、上記以上の受入条件を合格扱いしない。

### 自動検証の再実行（2026-11-25、作業ワークスペース）

| コマンド                                                                                                                         | 実測結果                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                                                      | 成功                                                                                                          |
| `pnpm typecheck`                                                                                                                 | 成功                                                                                                          |
| `pnpm format:check`                                                                                                              | 成功                                                                                                          |
| `pnpm test`                                                                                                                      | 70/70成功、9 suites、失敗0、skip 0                                                                            |
| `pnpm build`                                                                                                                     | 成功                                                                                                          |
| `git diff --check`                                                                                                               | 成功                                                                                                          |
| `pnpm exec playwright test tests/e2e/ai-history.spec.ts tests/e2e/ai-ask.spec.ts --output=/tmp/vercel-study-ai-v1-final-results` | Chromium 37/37成功、失敗0。APIは`page.route()`等でモックし、実Gemini/Neon通信なし                             |
| `sql/ai/030_create_ai_qa_logs.sql`を使い捨てPostgreSQL 16で実行                                                                  | 新規作成・再実行成功。CHECK式・PK列・ASC index・`now()` defaultの不一致時に停止。テスト後コンテナを停止・破棄 |

これらはローカル自動検証結果であり、PR head上のCIや本番/Preview実機検証とは区別する。DDLの試験は使い捨てPostgreSQL 16に限られ、Neon上での実行・catalog照合はしていない。

## TASK-08 Preview/運用確認（2026-11-18）

### Vercel/GitHub読み取り確認

| 項目                             | 方法・証跡                                         | 結果                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基点/PR                          | GitHub read-only API、`git rev-parse origin/main`  | PR #8 merged。base `79e696c83e58d6ade664615be5a39b0d982cdb72`。作業branch `feature/ai-task-08-preview-docs`                                                |
| Project label / repository       | GitHub deployment metadata / 対象GitHub repository | Vercel deployment label `vercel-study-app`。repositoryは`Stone5656/vercel-study-app`。DashboardのGit connection表示は未確認                                |
| 最新Production deployment        | GitHub deployments API                             | SHA `79e696c83e58d6ade664615be5a39b0d982cdb72`、2026-11-18 07:01 UTC、deployment URL `https://vercel-study-dxbjgc13l-yjs-projects-e19df116.vercel.app`     |
| 最新Preview deployment           | GitHub deployments API                             | SHA `9b6a1cab55f1c7a4bb1c1aef5d74f2cd13f2fe13`、2026-11-18 06:53 UTC、deployment URL `https://vercel-study-gbbzlv5yg-stone5656s-projects.vercel.app`       |
| Preview protection               | 2026-11-18匿名GET（cookieなし、redirect追跡なし）  | `/`、`/ai/`、`/api/ai/history`すべてHTTP 302でVercel SSOへredirect。確認したデプロイ/pathで匿名取得できないことを確認                                      |
| Production protection / app stop | 同Production deployment URLへの匿名GET             | `/api/ai/history`はHTTP 302でSSOへredirect。アプリに到達せず、Productionの`DEMO_DISABLED`応答は実環境で未確認。POSTは行っていない                          |
| Dashboard settings               | Vercel authenticated Dashboard/CLI                 | Project settingsを読み取る認証済み手段がなく、Node.js runtime、Fluid Compute、Function実効maxDuration、Protection method/scope/例外、canonical URLは未確認 |
| Environment variable scopes      | 値を表示しないread-only Dashboard参照              | Dashboardにアクセスできず、変数名の有無・Preview/Production scopeとも未確認。`vercel env pull`は未使用                                                     |
| local secret file                | filename/tracking/ignore metadata only             | `.env`は存在するが内容を開いていない。Git追跡対象ではなくignoreされる                                                                                      |

GitHub deployment metadataはdeployment SHAとProject labelを示すだけで、Vercel Project SettingsのNode/runtime/secret/protection設定を証明しない。公式の一般設定情報は[`spec.md`](spec.md)に記し、Project個別値は推定していない。

| Environment variable | Vercelでの登録                                                       | Preview / Production scope                             |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| `AI_DEMO_ENABLED`    | 未確認                                                               | 未確認                                                 |
| `AI_MOCK_ENABLED`    | 未確認                                                               | 未確認                                                 |
| `GEMINI_API_KEY`     | 未確認（値は取得していない）                                         | 未確認                                                 |
| `GEMINI_MODEL`       | 未確認                                                               | 未確認                                                 |
| `DATABASE_URL`       | 未確認（値は取得していない）                                         | 未確認                                                 |
| `VERCEL_ENV`         | プラットフォーム提供のシステム変数だが対象deploymentでの実値は未確認 | deployment runtime内でのProduction/Preview判定は未観測 |

### 最終コマンド（Node v26.13.0 / pnpm 12.8.1 / Chromium、ローカル作業環境）

| コマンド                                                                                                                       | 結果                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                                                    | 成功                                                                                                                       |
| `pnpm typecheck`                                                                                                               | 成功                                                                                                                       |
| `pnpm format:check`                                                                                                            | 最終実行成功。初回の`requirements.md`差分をPrettierで修正後に再実行                                                        |
| `pnpm test`                                                                                                                    | 成功、70 tests / 9 suites（pass 70 / fail 0 / skip 0）。Production guardを含み、TODO V1/V2 server tests成功                |
| `pnpm build`                                                                                                                   | 成功                                                                                                                       |
| `git diff --check`                                                                                                             | 成功                                                                                                                       |
| `pnpm exec playwright test tests/e2e/ai-history.spec.ts tests/e2e/ai-ask.spec.ts --output=/tmp/vercel-study-ai-task08-results` | 成功、37/37 Chromium tests（37 passed / 0 failed）。page.route mock、実Gemini/Neon通信なし                                 |
| 静的秘密/UI確認                                                                                                                | Git追跡`.env`なし、local `.env` ignored、`public/`にGemini/DB/SDK識別子なし、AI UIに`innerHTML`代入なし、`vercel.json`なし |

credential-shaped patternの静的scanでは、DBエラー漏えいテスト中のplaceholder PostgreSQL URIだけが一致した。これはテストfixtureであり、値は表示・転記していない。`.env`はignore/tracking metadataだけを確認して内容を読んでいない。

必須コマンド一式はPrettier適用後に再実行し、すべて成功した。環境はLinux、Node v26.13.0、pnpm 12.8.1、Playwright Chromium。Playwright outputは`/tmp`へ保存し、root所有`test-results/`には触れていない。実DB依存TODO E2Eは実行していない。

### 結論と未実施

- SupertestのProduction testでは`VERCEL_ENV=production`と`AI_DEMO_ENABLED=true`でPOST/GETとも503 `DEMO_DISABLED`、AI Service/Model呼出し0回を確認。TODO server testsも成功。これは実ProductionへのHTTP確認ではない。
- Preview匿名GETは確認deployment URL上で保護されていたが、例外一覧/canonical aliasは未確認。Vercel設定詳細が未確認なのでPreview AIを有効化してよいとは判定しない。
- Gemini HTTP request timeout 30秒にNeon INSERTと応答時間が加算される。Browser POST 45秒 / history GET 15秒はFunction execution durationと別。Function上限が不明なため時間整合性は未判定。
- 実Gemini、実Neon DDL/INSERT/SELECT、DB依存E2E、Preview/Productionアプリ応答は未実施。実施済み扱いにしない。
- Neon SQLは静的レビューのみ。CHECK式は`pg_get_constraintdef`、PK列、index列/順序/方向は`pg_get_indexdef`/`pg_index`、`created_at` defaultは`pg_get_expr`で照合し、同名オブジェクト不一致時に停止する必要がある。SQL実行はしていない。

## 4. TASK-01変更後（2026-11-18）

| 項目                | 結果                                       |
| ------------------- | ------------------------------------------ |
| `pnpm lint`         | 成功                                       |
| `pnpm typecheck`    | 成功                                       |
| `pnpm format:check` | 成功                                       |
| `pnpm test`         | 成功、43 tests / 6 suites（新規3、既存40） |
| `pnpm build`        | 成功                                       |

T15はSupertestによる自動テストであり、実Vercel環境の確認ではない。T20はモックを使用する既存サーバーテストによる回帰確認であり、実NeonやブラウザE2Eは含まない。

## 5. 未実施の実環境試験

- 実NeonへのDDL適用、INSERT、SELECT
- 実GeminiへのgenerateContent
- Vercel Previewアクセス保護とAI有効化
- Vercel Productionでの強制停止
- Vercel Function上限と30秒timeoutの整合

## 6. TASK-02変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、50 tests / 7 suites |
| `pnpm build`        | 成功                      |

TASK-02で追加した7件はすべてfake Modelまたは行readerを使用する。履歴ありのDTO、最大20件、DB障害503、想定外500、デモ停止、Production停止を確認した。既存/TASK-01の43件も成功した。

初回の全テストでは、TASK-01の有効時テストが履歴Controller追加後の既定Modelへ到達し、環境内DB設定を介して接続を試みたため1件失敗した。秘密値は読み取っていない。テストへfake Modelを明示注入して実DB経路を除去し、再実行で50件すべて成功した。

不正JSON、16KiB超過、非JSON（T06〜T08）はGET履歴APIに本文がなく、今回の指示で質問保存APIが禁止されているため未実施のままとする。TASK-03でAI専用parserとともに実装・検証する。

## 7. TASK-03変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、62 tests / 8 suites |
| `pnpm build`        | 成功                      |

POSTの正常保存順、trim、コードポイント境界、JSON構文、16KiB超過、非JSON、Service失敗/空回答、DB失敗、公開制御をfake Service/Modelによる自動テストで確認した。GET履歴とTODO V1/V2の既存テストも成功した。

これらは模擬Serviceとfake DB依存を使った自動テストであり、実NeonへのINSERT/SELECT成功を示さない。SQL、実DB、実Gemini、Preview/Productionでの実環境検証は未実施。

SQLレビュー指摘: 既存同名制約の式およびindexのキー列・順序・方向まで完全一致を確認できない。DDLの修正とレビュー承認後までNeonへ適用しない。

## 8. TASK-04変更後（2026-11-18）

| 項目                | 結果                      |
| ------------------- | ------------------------- |
| `pnpm lint`         | 成功                      |
| `pnpm typecheck`    | 成功                      |
| `pnpm format:check` | 成功                      |
| `pnpm test`         | 成功、68 tests / 9 suites |
| `pnpm build`        | 成功                      |

Gemini SDK境界はfake clientで検証し、実Gemini HTTP通信は実施していない。モデル・prompt単独・1024 token・30秒HTTP timeout・attempts 1・自動継続/AFC無効・空/欠落回答・設定不足・一般化した通信失敗を確認した。ProductionではService呼出しが0回である。

実Neon INSERT/SELECT、API keyを設定した手動実機試験、Preview/Production実環境動作は未実施。Vercel Function上限・runtime Nodeバージョンも未確認。

## 9. TASK-05履歴UI（2026-11-18）

| 項目                | 結果                       |
| ------------------- | -------------------------- |
| `pnpm lint`         | 成功                       |
| `pnpm typecheck`    | 成功                       |
| `pnpm format:check` | 成功                       |
| `pnpm test`         | 成功、68 tests / 9 suites  |
| `pnpm build`        | 成功                       |
| AI履歴UI E2E        | 成功、15/15 Chromium cases |
| `git diff --check`  | 成功                       |

Playwright履歴レスポンスはすべて`page.route()`でモックし、実Neonへ接続していない。UI reloadはモックAPIの再取得を示すだけで、実DB永続化を確認したものではない。DDLの制約/index定義照合は未解決である。TASK-04の設定不足時503と実行失敗時502の`AI_UNAVAILABLE` status不一致はPR #6で502に統一済み。

指定コマンド`pnpm exec playwright test tests/e2e/ai-history.spec.ts`は既存のroot所有`test-results/.last-run.json`に対するpermission deniedで、browser起動前に停止した。既存結果ファイルを変更・削除せず、Chromiumをユーザーcacheへ導入し、`pnpm exec playwright test tests/e2e/ai-history.spec.ts --output=/tmp/vercel-study-ai-task05-results`で同じ15ケースを実行して全件成功した。初回実行時に検出したテスト期待値の曖昧さ2件を修正して再実行した結果である。

TODO回帰は`pnpm test`内の既存サーバーテストにより確認した。実DBを使う既存TODO E2Eは今回実行していない。

## 10. TASK-06質問送信UI（2026-11-18）

| 項目                | 結果                                                         |
| ------------------- | ------------------------------------------------------------ |
| `pnpm lint`         | 成功                                                         |
| `pnpm typecheck`    | 成功                                                         |
| `pnpm format:check` | 成功                                                         |
| `pnpm test`         | 成功、68 tests / 9 suites                                    |
| `pnpm build`        | 成功                                                         |
| `git diff --check`  | 成功                                                         |
| AI履歴・質問UI E2E  | 成功、32/32 Chromium cases（UI01〜UI31、date edge case含む） |

E2EではPOST/GETを`page.route()`でmockし、実Gemini・Neonへ通信していない。45秒timeoutはPlaywright clockで進め、実時間待機を行わず、二重送信なし・入力保持・保存結果不明表示を確認した。POST成功後の履歴GET失敗では回答表示と送信成功を維持し、履歴更新失敗を別表示する。

E2E出力は既存のroot所有`test-results/`を変更せず、`--output=/tmp/vercel-study-ai-task06-results`へ保存した。TASK-05と同様、Playwrightの既定出力先はpermission deniedとなる環境上の制約がある。

実Neonへの保存/履歴再取得、実Geminiの回答、Preview/Production、実回線断時のserver-side処理継続は未実施。`ai_qa_logs`の制約/index定義照合の未解決指摘は継続する。`AI_UNAVAILABLE` statusはPR #6で502へ統一済み。

## 11. TASK-07異常系・回帰（2026-11-18）

| 項目                   | 結果                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `pnpm lint`            | 成功                                                       |
| `pnpm typecheck`       | 成功                                                       |
| `pnpm format:check`    | 成功                                                       |
| `pnpm test`            | 成功、70 tests / 9 suites                                  |
| `pnpm build`           | 成功                                                       |
| `git diff --check`     | 成功                                                       |
| Playwright履歴・質問UI | 成功、37/37 Chromium cases                                 |
| セキュリティ静的確認   | public secret/SDK検索なし、`innerHTML`代入なし、ログ固定文 |

追加修正は履歴GETの15秒deadlineとHTTP 200限定、古いGETの結果隔離。既存server testsを再利用し、保存Promise未完了時に201未返却の1件を追加した。Playwrightでは初期GETとPOST後GET双方のtimeout、GET 201拒否、競合、POST成功・GET失敗時の回答保持を確認。APIはすべてモック。

静的セキュリティ確認では`public/`内に`GEMINI_API_KEY`、`DATABASE_URL`、`@google/genai`の参照がなく、AI UIに`.innerHTML`代入がないことを確認した。`.env`系を除外したソースのcredential-shaped pattern検索も一致なし。AI Serviceのログ呼出しは固定文`Gemini request failed`だけ。ProductionではAI guardのserver testsでService/Model callが0回。未設定API key/modelのServiceテストは安全に失敗し、既存appのGET `/` Supertestも成功する。秘密ファイルの値を手動で開いて出力していない。

実Neon/Gemini/Previewの確認は未実施。既存TODO V1/V2のserver testsは成功し、TODOのDB依存Playwright E2Eは実行していない。SQLは静的確認のみで、CHECK定義、index列/順序/方向、`created_at` defaultの既存定義との完全一致は未検証。修正案は、名前付きCHECKに対する`pg_get_constraintdef`、index全定義に対する`pg_get_indexdef`と`pg_index` catalog情報、defaultに対する`pg_get_expr`を読み取り専用queryで確認し、完全一致を明示する安全検査をDDLへ加えること。今回DBへSQLは実行していない。

Playwright出力は既存root所有`test-results/`を変更せず、`--output=/tmp/vercel-study-ai-task07-results`へ保存した。TASK-05/06で確認済みの既定出力先permission issueは継続。
