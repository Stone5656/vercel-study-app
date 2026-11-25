# AI質問・会話アプリ 提出概要

最終更新: 2026-11-25

## 1. アプリ概要

Express 5 / TypeScriptを中心としたWebアプリに、単発質問のAI V1と、会話を継続できるAI V2を実装した。画面はV1が`/ai/`、V2が`/ai/v2/`。EJS/static HTML・CSS・browser JavaScriptを使い、ReactやSPA frameworkは使用しない。既存のTOP、TODO V1/V2も維持する。

## 2. 機能一覧

### AI V1

- 1回ごとの質問をGeminiへ送り、回答取得後にDBへ保存する。
- 最新20件の質問・回答履歴を表示する。
- 模擬回答はGemini通信だけを置き換える。DB保存にはNeonとV1用テーブルが引き続き必要。
- UIは失敗時の入力保持、timeout、重複送信抑止、安全なテキスト描画に対応する。

### AI V2

- 話題別に会話を作成・選択し、再質問できる。
- 選択会話の最新20 turnを古い順に表示する。
- Geminiへ同じ会話の保存済み最新5 turnと今回の質問を渡す。
- 会話はV2専用`ai_v2_conversations` / `ai_v2_turns`に保存し、V1/TODOの表とは分離する。
- 入力検証、非同期状態、timeout、送信抑止、失敗時入力保持、安全なテキスト表示に対応する。

## 3. アーキテクチャ

- Browser: 静的HTML/CSS/JavaScript (`public/ai/`, `public/ai/v2/`)
- Web: Express router/controller/service/model (`src/apps/ai/`)
- AI: サーバー側の公式`@google/genai` SDK
- Database: `pg`共有Poolを通じたNeon PostgreSQL
- V1 DDL: `sql/ai/030_create_ai_qa_logs.sql`
- V2 DDL: `sql/ai/040_create_ai_v2_tables.sql`
- Deployment: Vercel想定。不要な`vercel.json`は追加していない。

## 4. Gemini APIと公開制御

API key/modelはサーバー環境変数`GEMINI_API_KEY` / `GEMINI_MODEL`から読み取る。V2は`models.generateContent`を使い、最大1024 output tokens、SDK HTTP request timeout 30秒、retry attempts 1、automatic continuationとautomatic function callingを無効にする。Geminiへの失敗・空回答では保存せず、DB commit完了後にのみ成功応答を返す。

V1のローカル模擬回答は`AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=true`、`VERCEL_ENV`未設定で有効となるが、Neon保存は必要。V2 APIは`NODE_ENV=development`、`AI_V2_DEMO_ENABLED=true`、`VERCEL_ENV`未設定の組み合わせに限定する。Preview/ProductionではV2 APIを有効化せず、認証のないV2 APIを公開しない。ProductionのV1 AI APIも停止する。環境変数や公開設定を本提出作業では変更していない。

## 5. データベースとDDL

V1は`ai_qa_logs`、V2は`ai_v2_conversations`と`ai_v2_turns`を使用する設計で、TODO V1/V2とは別テーブルである。

V2 DDLについて、利用者はNeon Branch `production` / Database `neondb`への適用と定義照合が成功したと報告した。さらに同環境への保存結果も成功との報告がある。CodexはNeonに接続しておらず、この結果は利用者報告として扱う。開発時には使い捨てPostgreSQL 16で新規作成、再実行、同名制約/indexの不一致時に停止することを確認した。これは実Neonと別の検証である。

V1の`ai_qa_logs`については、CHECK/PK/index/defaultのcatalog完全照合という既存の確認事項が残る。V2利用者試験でのDDL定義照合報告をV1 DDLの証明として流用しない。

## 6. セキュリティと制限

- API keyとDB URLをbrowserへ送らない。質問/回答は`textContent`等で表示しHTMLとして解釈しない。
- API errorは固定文を返し、SQL・認証情報・内部例外を公開しない。
- V1/V2のAI APIをProductionで停止。V2はローカル開発条件以外では停止する。
- V2にログイン、ユーザー認可、会話削除、保存期限、ページネーションはない。未認証V2 APIを公開しない。
- VercelのNode runtime、Function実行上限、Fluid Compute、環境変数scope、Protection例外は実設定を確認できていない。

## 7. 検証結果

### 自動テスト・コード検証

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `git diff --check`: 成功。
- Node.js server tests: 103/103成功。
- AI V1・AI V2・TOPを含むChromium Playwright: 55/55成功（V2 suiteは17/17）。APIはroute mockで、実Gemini/Neonへ接続しない。
- 使い捨てPostgreSQL 16でV2 DDLの新規作成/再実行、および不一致制約・indexでのfail-closedを確認。
- PR #11のVercel CI checks: 2件成功。PRはSquash merge済み。

### 利用者によるローカル手動確認

V1について利用者はローカルで実Gemini接続、Express経由の回答取得、Neonを使ったAI質問アプリの動作確認成功を報告した。

V2について利用者はローカル画面、会話作成、Gemini回答、同一会話の追加質問、会話間の文脈分離、再読み込み後の再開、Neonへの保存、DDL定義照合を成功と報告した。対象はNeon `production` / `neondb`。会話一覧GET 200、会話作成POST 201、履歴GET 200、質問POST 201も成功との報告。実施日時、response body、保存行IDは受領していない。これらは利用者報告であり、Codexによる実機再試験ではない。

詳細な検証主体・結果・未確認項目は[`test-results.md`](test-results.md)および[`v2/test-results.md`](v2/test-results.md)を参照。

## 8. 未確認事項と今後の作業

- Vercel Preview/ProductionでのV2 API停止・アクセス保護・実環境挙動、Node runtime/Function上限・環境変数scope。
- Neonでのtransaction rollback/障害時挙動とCodexによる独立catalog再確認。
- 実DBを使うTODO E2E。既存データ変更を避けて未実施。
- V1のNeon DDLに残るcatalog完全照合。
- 会話/履歴の保持期間・削除・認証/ユーザー分離。
- 公開環境でAIを有効化する場合の認証、権限、rate limit、アクセス保護、実行上限の追加設計。

## 9. 提出先

- Repository: <https://github.com/Stone5656/vercel-study-app>
- V2実装PR（Squash merge済み）: <https://github.com/Stone5656/vercel-study-app/pull/11>
- V1画面: `/ai/`（ProductionのAI APIは停止）
- V2画面: `/ai/v2/`（APIはローカル開発専用）

Vercelの提出用公開URLは、認証・環境設定の確認が済んでおらず、この資料では確定URLとして提示しない。
