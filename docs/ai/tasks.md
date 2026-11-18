# AI質問機能 実装計画

各TASKは完了報告と承認を受けてから次へ進む。要件・設計IDは`requirements.md`と`spec.md`を参照する。

## TASK-01 共通準備・デモ停止

- 対応ID: REQ-AI-009, 010, 013, 014 / DES-AI-001, 009
- 変更対象: `aiMiddleware.ts`, `aiRouter.ts`, `src/app.ts`, `tests/server/ai-demo.test.ts`, `docs/ai/*`
- 理由: AI APIを既定停止し、後続実装を安全に追加できる登録位置を確保するため
- 実装: Production強制停止、true完全一致、両APIの503固定応答、AIルーターを共通JSON parserより前へ登録
- 確認コマンド: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`
- 期待結果: 新規停止テストと既存40件が成功し、TODO回帰なし
- 実測結果: 2026-11-18に全検証成功。43 tests / 6 suites（新規3件、既存40件）
- 未検証: Previewアクセス保護、Vercel環境、実DB、実Gemini

## TASK-02 DBスキーマ・履歴API

- 対応ID: REQ-AI-003, 004, 009, 010, 013, 015 / DES-AI-001, 003, 005, 006, 009
- 変更対象: `aiModel.ts`, `aiController.ts`, `aiRouter.ts`, `sql/ai/030_create_ai_qa_logs.sql`, `tests/server/ai-history.test.ts`, AI文書
- 理由: 非破壊DDLと最新20件の履歴契約を確立するため
- 実装: 非破壊DDLと事前確認SQL、DTO変換、固定SELECT、0件、最大20件、同日時ID降順、DB/内部エラー変換、Model DI
- 確認コマンド: pnpm検証一式、SQLファイルの目視確認
- 期待結果: 履歴0件/あり/最大20件、DB障害、内部例外、デモ停止、Production停止がDB非依存テストで成功
- 実測結果: 2026-11-18に50 tests / 7 suites成功。TASK-02新規7件と既存43件が成功
- 未検証: SQL実行、実Neonの同名テーブル定義、実DB DTO変換。T06〜T08は今回の明示範囲外としてTASK-03へ延期

## TASK-03 模擬回答・保存処理

- 対応ID: REQ-AI-002, 003, 005, 006, 010, 013 / DES-AI-002, 003, 005, 009
- 変更対象: `aiController.ts`, `aiModel.ts`, `aiRouter.ts`, `aiMiddleware.ts`, server tests
- 理由: 外部AIと切り離して処理順・保存契約を確定するため
- 実装: AI専用JSON/Content-Type/size処理、prompt検証、Service DI、模擬回答、INSERT後201、DB失敗時非成功
- 確認コマンド: pnpm検証一式
- 期待結果: T01, T04〜T09がモックで成功
- 実測結果: 2026-11-18に全検証成功。62 tests / 8 suites
- 未検証: 実NeonへのINSERT、SQL適用、実Gemini。模擬回答とDB保存の自動テストはfake依存を使用

## TASK-04 Gemini API接続

- 対応ID: REQ-AI-002, 011, 012, 016 / DES-AI-004, 009
- 変更対象: `aiService.ts`, `package.json`, `pnpm-lock.yaml`, server tests, README
- 理由: 公式SDKで単発質問を安全に実行するため
- 実装: `@google/genai` exact version、指定モデル、30秒HTTP timeout、1024 token、retry/continuation/AFC無効、環境別Service選択、空回答判定
- 確認コマンド: SDK型検査、モックテスト、pnpm検証一式
- 期待結果: T10, T11, T19が実通信なしで成功
- 実測結果: 2026-11-18にmock SDK境界で自動テスト済み。実Gemini通信なし
- 未検証: 実Gemini（学生本人のAPI key設定後）、実Neon、Vercel Node runtimeと実行上限

## TASK-05 履歴表示UI

- 対応ID: REQ-AI-001, 004, 008 / DES-AI-007, 009
- 変更対象: `public/ai/index.html`, `public/ai/app.js`, `views/index.ejs`, E2E tests
- 理由: 初期表示・再読込で履歴を安全に表示するため
- 実装: TOP導線、履歴GET、0件表示、textContent描画
- 確認コマンド: pnpm検証一式、Playwright
- 期待結果: T02, T03, T14がモック/E2Eで成功
- 実測結果: 未実施
- 未検証: Preview表示

## TASK-06 質問送信UI

- 対応ID: REQ-AI-001, 007, 008, 016 / DES-AI-008, 009
- 変更対象: `public/ai/index.html`, `public/ai/app.js`, E2E tests
- 理由: 非同期送信の状態と失敗時UXを実装するため
- 実装: 待機、連打防止、45秒、JSON構造検証、入力保持/消去、finally復帰
- 確認コマンド: pnpm検証一式、Playwright
- 期待結果: T12, T13, T14が成功
- 実測結果: 未実施
- 未検証: 実回線timeout時の保存状態

## TASK-07 異常系・回帰テスト

- 対応ID: 全REQ / DES-AI-002, 003, 009
- 変更対象: server/E2E tests、`test-results.md`
- 理由: エラー契約、秘密管理、TODO回帰を確定するため
- 実装: T01〜T20不足分、配信物の秘密文字列検査、V1/V2回帰
- 確認コマンド: pnpm検証一式、Playwright
- 期待結果: モック可能な全項目が成功
- 実測結果: 未実施
- 未検証: 実DB/実Geminiは別区分で記録

## TASK-08 Preview確認・README・提出資料

- 対応ID: REQ-AI-009, 012, 014, 016 / DES-AI-010
- 変更対象: README、`docs/ai/*`
- 理由: Preview保護・環境上限・運用手順を実環境で確認するため
- 実装: 保護状態確認後のPreview限定有効化手順、Production停止確認、提出記録
- 確認コマンド: Vercel設定の読み取り確認、Preview手動試験（事前承認後）
- 期待結果: Previewだけが条件付きで利用可能、Productionは503
- 実測結果: 未実施
- 未検証: 履歴削除/保存期間（仕様未決）
