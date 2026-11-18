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
- 実測結果: TASK-05実装済み。AI履歴UI専用Playwright 15件で静的画面、モック履歴、エラー/停止状態、安全な描画を確認（コマンド実行結果は`test-results.md`に記録）
- 未検証: 実Neonへの永続化と実データの再読込、Preview表示。質問送信はTASK-06へ持ち越し

## TASK-06 質問送信UI

- 対応ID: REQ-AI-001, 007, 008, 016 / DES-AI-008, 009
- 変更対象: `public/ai/index.html`, `public/ai/app.js`, E2E tests
- 理由: 非同期送信の状態と失敗時UXを実装するため
- 実装: trim/コードポイント/本文byte検証、非同期POST、待機と連打防止、201 DTO検証、既知エラー固定文、45秒timeout、成功後の回答表示と履歴更新、GET失敗と送信成功の分離
- 確認コマンド: pnpm検証一式、Playwright
- 期待結果: UI15〜UI31とTASK-05 UI01〜UI14がE2E mockで成功
- 実測結果: 実装済み。Playwright 32/32件、server tests 68件成功
- 未検証: 実Gemini/Neon/Vercelでの送信、実回線timeout時における保存状態

## TASK-07 異常系・回帰テスト

- 対応ID: 全REQ / DES-AI-002, 003, 009
- 変更対象: server/E2E tests、`test-results.md`
- 理由: エラー契約、秘密管理、TODO回帰を確定するため
- 実装: T01〜T20棚卸し、履歴GET 15秒待機期限とHTTP 200限定、依存を待つ201テスト、秘密情報の静的検査、V1/V2回帰
- 確認コマンド: pnpm検証一式、Playwright
- 期待結果: 既存実装済みテストを再利用し、不足ケースと回帰試験が成功
- 実測結果: `pnpm test` 70件/9 suites、Playwright 37/37、lint/typecheck/format/build/diff-check成功
- 未検証: 実DB/実Gemini/Previewは別区分で記録し、成功扱いしない

### TASK-07のPR依存関係

- TASK-07開始時、PR #7（`feature/ai-task-06-question-ui`, HEAD `5ab1c7f`）は未マージだった。
- TASK-07はHEAD `5ab1c7f`から作成した独立ブランチで作業する。PR #7へTASK-07のcommitを追加しない。
- マージ順はPR #7 → TASK-07のPR。PR #7が先にmainへ入った場合はTASK-07側でそのmerge baseとの差分を確認してから後続PRをレビューする。

## TASK-08 Preview確認・README・提出資料

- 対応ID: REQ-AI-009, 012, 014, 016 / DES-AI-010
- 変更対象: README、`docs/ai/*`
- 理由: Preview保護・環境上限・運用手順を確認し、提出用記録を整備するため
- 実装: 匿名GETでPreview/Production deployment URLの保護を確認し、Dashboard未確認の設定と安全な確認手順を明記。README、要件/設計/試験/提出資料を更新
- 確認コマンド: `curl`による匿名GETのみ、GitHub deployment metadata読み取り、Production guard Supertest、最終pnpm検証とAI Playwright
- 期待結果: 観測した事実と未確認項目を分離し、Preview AIの有効化条件を明確化
- 実測結果: Previewの`/`, `/ai/`, `/api/ai/history`とProduction deploymentの`/api/ai/history`は匿名GET時に302でVercel SSOへredirect。PR #8 merged、Production deployment SHA `79e696c…`、Preview deployment SHA `9b6a1ca…`。Supertestの実測は下記`test-results.md`に追記
- 未検証: Dashboard上の接続repository詳細、Node.js runtime、Fluid Compute、実効`maxDuration`、環境変数scope、protection exception、canonical URL、実Gemini/Neon/DB E2E、履歴削除/保存期間
