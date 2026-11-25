# AI質問機能 設計書

## 1. 構成

| 設計ID     | 責務                 | 対応要件                  | 主なファイル                               |
| ---------- | -------------------- | ------------------------- | ------------------------------------------ |
| DES-AI-001 | AI API公開制御       | REQ-AI-009, 014           | `aiMiddleware.ts`, `aiRouter.ts`, `app.ts` |
| DES-AI-002 | AI専用HTTP解析       | REQ-AI-005, 006, 010      | `aiMiddleware.ts`, `aiRouter.ts`           |
| DES-AI-003 | ControllerとAPI契約  | REQ-AI-002, 004, 010, 013 | `aiController.ts`                          |
| DES-AI-004 | Gemini Service       | REQ-AI-002, 011, 012, 016 | `aiService.ts`                             |
| DES-AI-005 | DB Model/DTO         | REQ-AI-003, 004, 013      | `aiModel.ts`                               |
| DES-AI-006 | 非破壊DBスキーマ     | REQ-AI-003, 004, 015      | `sql/ai/030_create_ai_qa_logs.sql`         |
| DES-AI-007 | 履歴UI               | REQ-AI-001, 004, 008      | `public/ai/index.html`, `public/ai/app.js` |
| DES-AI-008 | 質問送信UI           | REQ-AI-001, 007, 008, 016 | `public/ai/index.html`, `public/ai/app.js` |
| DES-AI-009 | 自動テストと依存注入 | REQ-AI-013, 014           | `tests/server/*`, `tests/e2e/*`            |
| DES-AI-010 | 環境・運用文書       | REQ-AI-009, 012, 014, 016 | `README.md`, `docs/ai/*`                   |

## 2. ミドルウェア順序

`src/app.ts`では次の順序とする。

1. `express.urlencoded()`（既存）
2. `createAiRouter()`
   - 対象メソッドへのデモ停止ガード
   - TASK-02/03でContent-Type検証
   - AI専用`express.json({ limit: 16_384 })`
   - AI専用JSON/sizeエラー変換
   - Controller
3. 既存の共通`express.json()`
4. TODO V1/V2ルーターと既存エラーハンドラー
5. 静的配信と既存画面

これによりAI専用上限を先に適用し、TODOのJSON解析契約は維持する。TASK-01では1、2の公開ガード、3以降の順序だけを実装する。

TASK-03でPOST用のContent-Type検証、AI専用JSON parser、JSON/sizeエラー変換を追加した。共通parserより前のAIルーター内部で処理する。

## 3. 公開制御

`AI_DEMO_ENABLED`は文字列`true`との完全一致だけを有効とする。ただし`VERCEL_ENV=production`では常に無効とする。無効時はControllerやJSONパーサーより先に503 `DEMO_DISABLED`を返す。

Previewは、担当者がVercelアクセス保護を確認した後に限って`AI_DEMO_ENABLED=true`を設定する。アプリはアクセス保護の設定状態を推測しない。

## 4. Controller / Service / Model

- ControllerはUnicodeコードポイント数を`Array.from(trimmedPrompt).length`相当で検証する。
- Serviceへ渡すのは現在のtrim済みpromptだけで、履歴は渡さない。
- Service成功後にModelのINSERTを行い、INSERTが返したDTOだけを201で返す。
- Modelは`requirePool()`を使い、`$1`等のplaceholderを使う。
- 一覧SQLは`ORDER BY created_at DESC, id DESC LIMIT 20`とする。
- 例外は外部/DB/内部の境界で分類し、安全な固定エラーへ変換する。

### TASK-02確定仕様

- `AiHistoryItem`は`id`, `prompt`, `response`, `createdAt`を公開し、DBの`response_text`を`response`へ変換する。
- `created_at`はModelで`Date#toISOString()`相当のUTC ISO 8601文字列へ変換する。
- Modelは固定SQLで最大20件を取得し、返却時にも20件へ制限する。
- Modelのquery/接続失敗は`AiDatabaseError`へ包み、Controllerは503 `DB_UNAVAILABLE`へ変換する。
- DTO変換などの想定外例外は500 `INTERNAL_ERROR`へ変換する。
- Controllerへ`AiHistoryModel`を注入でき、テストは実DBを使用しない。

### DBスキーマ

`sql/ai/030_create_ai_qa_logs.sql`は`CREATE TABLE IF NOT EXISTS`を使い、次を定義する。

- `id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `prompt TEXT NOT NULL`
- `response_text TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- promptの`char_length` 1〜2,000と空白のみ禁止
- responseの空白のみ禁止
- `(created_at DESC, id DESC)`複合index

PostgreSQLの`char_length`はデータベース文字エンコーディング上の文字数を数え、サロゲートペアを2と数えるJavaScriptの`string.length`は使用しない。TASK-03のTypeScript検証は`Array.from(trimmedPrompt).length`でUnicodeコードポイントを数える。結合文字列は複数コードポイントとして数えるため、DBとアプリの意図を合わせる。空白判定はアプリの`trim()`を主とし、DBのPOSIX`[[:space:]]`制約を防御層とする。

SQL先頭の確認queryでcolumns、constraints、indexesを表示する。同名テーブルがある場合は確認queryだけを先に実行し、差異があれば後続DDLを実行しない。DDL内でも期待する列・名前付き制約を確認し、差異時はindex作成前に例外で停止する。

### TASK-03質問送信仕様

- POST middleware順序はデモガード → JSON Content-Type検証 → `express.json({ limit: 16_384, strict: false })` → AI専用parser error handler → 模擬Service有効確認 → Controller。
- `strict: false`により有効なJSON scalarやnullもControllerへ渡し、JSON objectでない入力を`VALIDATION_ERROR`として扱う。不正JSON構文は`INVALID_JSON`、本文上限超過は`PAYLOAD_TOO_LARGE`。
- promptはtrim後に`Array.from(prompt).length`で1〜2,000コードポイントを確認し、trim後文字列をServiceとINSERTへ渡す。
- 回答生成後、空白だけの回答を拒否する。その後にだけModelのパラメータ化INSERTを実行し、`RETURNING`したDB行をDTOに変換する。INSERT成功後に限り201を返す。
- 模擬Serviceは固定文`接続確認用の模擬回答`を返す。Routerでは`AI_DEMO_ENABLED=true`に加えて`AI_MOCK_ENABLED=true`かつ`VERCEL_ENV`未設定の場合だけ有効。Preview/Productionは模擬回答経路を使用できず、`AI_UNAVAILABLE`を返す。
- Router factoryは公開ガード・履歴Model注入を保ち、模擬回答Serviceとsave関数も差し替え可能。

### SQLレビュー指摘とTASK-08対応

当初の`sql/ai/030_create_ai_qa_logs.sql`は制約の存在確認が中心で、式、PK列、indexのキー/順序/DESC、`created_at` defaultの完全照合が不足していた。TASK-08で`pg_get_constraintdef`、`pg_index`/`indkey`/`indoption`、`pg_get_indexdef`、`pg_get_expr`による事前表示と適用時検証を追加した。`IF NOT EXISTS`の同名indexが別定義なら後続検証で例外停止する。

修正SQLは使い捨てのPostgreSQL 16コンテナで初回作成と再実行を確認し、CHECK式・PK列・ASC index・`now()` defaultへ意図的に差し替えた場合に停止することも確認した。Neonへは実行していない。利用者からローカルNeonを使ったAI質問アプリ動作確認完了の報告はあるが、対象DB上のcatalog定義が修正後DDLと一致するかは再照合していない。DDLのコード上の不足は修正済み、実環境との定義一致は未確認として管理する。

## 5. Gemini SDK設計

TASK-04では`@google/genai` 3.4.0をexact pinで導入し、モデルID`gemini-3.5-flash-lite`を`models.generateContent`で呼び出す。API key/modelは実行時に環境変数から取得するため、未設定でもアプリ起動を妨げない。

予定設定:

```ts
config: {
  maxOutputTokens: 1024,
  automaticContinuation: false,
  automaticFunctionCalling: {
    disable: true,
  },
  httpOptions: {
    timeout: 30_000,
    retryOptions: {
      attempts: 1,
    },
  },
}
```

公式資料と3.4.0の型定義では`httpOptions.timeout`はHTTP request timeout（ミリ秒）であり、`attempts`は初回を含む試行数なので1は再試行なしを意味する。timeoutは全サーバー処理の総期限ではなく、DB保存・HTTP応答時間は別途必要。`automaticContinuation: false`は追加継続リクエストを止め、AFCもdisableにする。

Serviceは現在のprompt文字列だけを送り、履歴を参照しない。空または欠落したtext、API例外、timeoutを安全なService失敗へ変換する。Service内ログは固定の失敗文のみで、質問・回答・API key・例外本文は記録しない。Controllerはこれらを502 `AI_UNAVAILABLE`に変換してDBを呼ばない。

設定選択はRouter生成時に依存注入する。ローカルの`AI_DEMO_ENABLED=true`かつ`AI_MOCK_ENABLED=true`は固定模擬Serviceを選び、ローカルでmockがfalse/未設定の場合はGemini Serviceを選ぶ。Previewではmock選択を禁止してGemini Serviceのみとし、Productionは先行する公開ガードが常に503で停止する。

参照:

- [Google Gen AI SDK](https://googleapis.github.io/js-genai/)
- [GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)

Google公式のSDKリリース資料ではNode.js 22以上が必要とされる。プロジェクトのDev ContainerはPlaywright公式イメージを使い、本確認環境はNode 26だった。対象Vercel runtimeのNodeバージョンは未確認。

## 6. UI設計

- `/ai/` は既存の`express.static(public)`で配信し、`/ai`は静的配信の末尾スラッシュリダイレクトを利用する。TOPから `/ai/` へリンクする。
- 初期表示およびPOST後の`GET /api/ai/history`は15秒の独立したブラウザ待機期限を持つ。HTTP 200だけを正常として扱う。HTTP 503 + `DEMO_DISABLED`は公開停止、それ以外のstatus、JSON、items配列、DTO異常はエラーとする。APIの返却順を保って最大20件を描画し、自動再試行しない。
- 履歴GETにはrequest idとAbortControllerを使い、新しい取得が古い取得を置き換える。古い結果は画面を更新できない。タイマーとcontrollerを各取得のfinallyで解放する。
- ローディング、正常、0件、一般エラー、`503 DEMO_DISABLED`を別の状態として表示する。詳細なエラー文字列は画面へ出さない。
- DOM `createElement()`、`textContent`、`append()`、`replaceChildren()`で質問・回答を描画する。日時が不正なら「日時不明」と表示する。
- 質問入力はtrim後のUnicodeコードポイント数を`Array.from(prompt).length`で検査し、1〜2,000文字を許可する。JSON本文は`TextEncoder`で16,384 byte以下か確認する。サーバー検証も維持する。
- submit時は標準遷移を止め、送信中フラグとdisabledボタンで二重送信を防止する。待機中は状態を表示する。
- POSTは`/api/ai/ask`へJSONで行う。201、`success: true`、itemのid/prompt/response/createdAtを検証し、成功itemを安全に表示して入力欄をクリアする。不正な201応答も再送せず履歴確認を案内する。
- APIエラーは既知のHTTP statusと`error.code`の組み合わせだけ固定メッセージに変換する。任意のmessage・未知code・不正JSONは一般エラーとする。失敗時は入力を保持する。
- POST成功後は入力欄をクリアして回答を保持した後に履歴を再取得する。履歴GETが失敗またはtimeoutでも質問送信の成功と回答表示を維持し、「回答は保存されましたが、履歴の更新に失敗しました」と別に案内する。送信ボタンは再度使用可能になる。
- POSTは`AbortController`で45秒後に中断する。履歴GETの15秒中断もサーバー処理やDB処理を取り消す保証はない。POSTのtimeoutはPOST応答までとし、POST成功時に解除する。
- 質問・回答はDOM要素の`textContent`で表示する。改行はCSSで保持し、Markdown変換はしない。
- Markdown変換、streaming、`innerHTML`への値挿入は行わない。

### TASK-05で記録した未解決事項

- `sql/ai/030_create_ai_qa_logs.sql`の同名制約と複合indexが既存定義に完全一致するか照合しきれていない。修正・レビュー承認前にNeonへ適用しない。
- E2Eのreload確認はPlaywright routeで応答をモックした再取得であり、実Neonの永続化確認ではない。

### APIエラーstatusのレビュー指摘

PR #6のマージで設定不足時の`AI_UNAVAILABLE`が502へ修正され、Gemini呼出し失敗時と一致した。TASK-05時点の文書に残っていた不一致の記述は解消済みとする。

TASK-05で利用したPlaywright出力先`test-results/`はroot所有で書込不可だった。既存ファイルの所有権は変更せず、TASK-06のE2Eでは`--output=/tmp/...`を指定した。

### TASK-07のPR依存関係

- PR #7は未マージ時点でTASK-07を開始した。TASK-07ブランチはPR #7のHEAD `5ab1c7f`を基点とする独立ブランチであり、PR #7へ変更は追加しない。マージ順はPR #7を先、TASK-07 PRを後とする。
- 履歴GETの15秒はこのUI向け設計値で、POSTの45秒とは独立する。AbortControllerによる中断はブラウザの待機を止めるだけで、DB処理のrollbackを保証しない。
- `GET /api/ai/history`の正常HTTP statusを200だけに限定する。201など他の2xxは不正応答として表示する。

## 7. Vercel実行上限

30秒のSDK HTTP request timeoutに加えてDB保存・HTTP応答時間が必要である。対象Vercelプロジェクトのプラン、Function runtime、`maxDuration`はリポジトリだけでは確認できないため未検証とする。Preview実通信前に実設定を確認する。不要な`vercel.json`は追加しない。

## 8. TASK-08環境・運用確認（2026-11-18）

### デプロイ識別と確認できた範囲

- GitHubのPR #8は2026-11-18にmainへマージ済み。Vercel連携のGitHub deployment metadataにあるProject表示名は`vercel-study-app`。
- Production deployment metadataはSHA `79e696c83e58d6ade664615be5a39b0d982cdb72`（2026-11-18 07:01 UTC）。Preview deployment metadataはSHA `9b6a1cab55f1c7a4bb1c1aef5d74f2cd13f2fe13`（2026-11-18 06:53 UTC）。いずれもGitHub deployments APIの記録であり、Vercel Dashboard設定の証明ではない。
- Preview URLの`/`、`/ai/`、`/api/ai/history`への匿名GETはHTTP 302でVercel SSOへredirectした。Production deployment URLの`/api/ai/history`もHTTP 302で同様にredirectした。POSTは行っていない。
- Vercel Dashboard、CLIの認証済み設定参照、Project Settings APIへアクセスできなかったため、接続repositoryのDashboard上の表示、Node.js runtime、Fluid Compute、Function実効maxDuration、環境変数の存在/scope、Protection exception一覧は未確認。公開GETの観測からこれらを推定しない。
- 匿名GETの実測は該当deployment URLと確認したpathに限定される。canonical alias、全route、設定上の例外はDashboardで確認する必要がある。Dashboard確認完了まではPreview AIを有効化しない。

### Timeout評価

Gemini SDKの30秒はHTTP request timeoutであり、Geminiがその期限内に返ってもNeon INSERTとExpress応答の時間が別途必要である。ブラウザPOST 45秒はbrowser wait deadline、履歴GET 15秒も別のbrowser deadlineであり、Vercel Functionの実行上限を延長しない。実効上限が30秒近辺以下なら、保存完了前にFunctionが終了する可能性があり、30秒より長い場合もDB/response余裕を含む確認が必要。現行Function設定は未確認のため整合性は未判定。`maxDuration`を含むVercel設定ファイルは追加していない。

### 環境変数と保護条件

`AI_DEMO_ENABLED`、`AI_MOCK_ENABLED`、`GEMINI_API_KEY`、`GEMINI_MODEL`、`DATABASE_URL`のVercel登録有無とPreview/Production scopeはDashboardで未確認。`VERCEL_ENV`はコードで読む名前であるが、対象デプロイでの実値は取得していない。値を表示・取得する操作は行っていない。ローカルに`.env`ファイルが存在するが、内容は開いておらずGit追跡対象でもないことを確認した。

DashboardではProject `vercel-study-app`の**Settings > Deployment Protection**でProtection method/scope/exceptionsを確認し、**Settings > Environment Variables**で変数ごとのPreview/Production scopeを値を開かずに確認する。Node.js versionは**Settings > Build and Deployment > Node.js Version**、Fluid ComputeはProjectの**Functions Settings > Fluid Compute**で確認し、実効durationはFunction詳細で確認する。値/scopeが確認できるまではAIのPreview有効化を行わない。

### Neon DDLの停止条件

`sql/ai/030_create_ai_qa_logs.sql`は変更・実行していない。適用前のread-only preflightでは、(1)`pg_get_constraintdef`で名前付きCHECK制約式、(2)`pg_constraint`と`pg_get_constraintdef`でPKの列・順序、(3)`pg_get_indexdef`と`pg_index`/`indkey`/`indoption`でindexのkey列・順序・DESC指定、(4)`pg_attrdef`と`pg_get_expr`で`created_at` defaultを取得する。期待定義との完全一致を照合し、オブジェクトがない場合は新規作成可能性を個別確認し、同名オブジェクトが不一致ならDDLを停止し手動レビューへ戻す。`IF NOT EXISTS`を定義一致の証明として扱わない。DDL修正・承認・適用は独立作業である。

### 本タスクの結論

Production停止はSupertestで確認済みだが、Production deployment URLのアプリ応答はSSO保護により未確認。Previewの確認したdeployment URL/pathは匿名利用を防いでいたが、Dashboardの例外設定とcanonical URLは未確認のためPreviewでAIを有効化してよい状態とは判定しない。実Gemini、実Neon、実DB E2E、Vercel Function/runtime/環境変数設定は未検証。

Vercel公式資料: [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Function limits](https://vercel.com/docs/functions/limitations)、[Fluid Compute](https://vercel.com/docs/fluid-compute)、[Deployment Protection](https://vercel.com/docs/deployment-protection)、[Environment Variables](https://vercel.com/docs/environment-variables)。公式資料は利用可能な設定方法・一般仕様を示すもので、対象Projectの実設定を証明しない。

## 9. V1最終ローカル手動確認（2026-11-25）

利用者から、実Gemini API接続、Express経由の回答取得、Neonを利用したAI質問アプリのローカル動作確認を完了したとの報告を受けた。これは利用者による手動確認として記録し、自動テストやVercel実環境確認とは区別する。このセッションでは実Gemini/Neonへ接続していないため、リクエスト詳細、実DB catalog定義、Preview/Productionの動作は独立に確認していない。テスト区分と記録は[`test-results.md`](test-results.md)を参照。
