# AI会話アプリ V2 要望書・現状調査

## 文書の目的

V1のAI質問アプリを維持したまま、話題ごとの会話作成、同じ会話での追加質問、再読み込み後の会話再開を可能にするV2の要望を定義する。本書は実装前の要望整理であり、V2コード、DDL、デプロイはまだ行っていない。

## 現状調査

調査基点はPR #9マージ後のmain `f242e6264e5889a627d8212a3b0546fc33e0cb62`、ブランチ`feature/ai-app-v2`。

| 項目       | 確認した現状                                                                                                                    | V2での扱い                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 実行構成   | Express 5、TypeScript、ESM/NodeNext、pnpm。`src/app.ts`がアプリ、`src/server.ts`がローカル起動                                  | 同じ構成を継承                                                                         |
| 静的配信   | `src/app.ts`の`express.static(process.cwd()/public)`で`public/`を配信                                                           | V2画面を`public/ai/v2/`へ追加。別Express画面ルートは原則不要                           |
| AI V1      | `src/apps/ai/aiRouter.ts`、`aiController.ts`、`aiService.ts`、`aiModel.ts`、`aiMiddleware.ts`。`/api/ai/ask`と`/api/ai/history` | V1ルートとモジュールは変更せずV2専用routerを追加                                       |
| Gemini     | `@google/genai`の`GoogleGenAI.models.generateContent`をサーバー側Serviceで使用。`GEMINI_API_KEY`/`GEMINI_MODEL`を参照           | SDKと既存のタイムアウト/再試行方針を再利用するが、履歴contentsはV2 Serviceが組み立てる |
| DB         | `src/db.ts`の`requirePool()`が共有pg Poolを返す。V1とTODOが利用                                                                 | 新しいPoolは作らず、V2 Modelが共有Poolを使用                                           |
| DBスキーマ | V1の`ai_qa_logs`、TODO用テーブルが存在。V2会話テーブルは未確認・未作成                                                          | V2専用テーブルを追加。V1/TODO表を変更・移行しない                                      |
| TODO       | `src/apps/todo/`および`src/apps/todo/v2/`に既存APIがある                                                                        | ルート、テーブル、テスト契約を維持                                                     |
| 公開制御   | V1は`AI_DEMO_ENABLED`で制御しProductionで停止                                                                                   | V2はより厳格に、`VERCEL_ENV`が設定される公開環境では常にAPI停止                        |
| テスト     | Node.js Test Runner、Supertest、Playwright、ESLint、TypeScript、Prettier                                                        | 既存ツールでV2固有のモックテストとUIテストを追加                                       |

### 参考資料との差異

講師参考資料の`docs/ai/v2/`は要望・要件・設計・実装計画を分ける点を参考にした。一方、参考資料内のroot `index.ts`/`db.ts`、CommonJS、`AI_DISABLED`、別の文字数上限、追加履歴ページネーション等は本リポジトリの`src/app.ts`/`src/db.ts`、ESM/NodeNext、`AI_DEMO_ENABLED`、本書の明示要件と一致しないため採用しない。今回の指示は最新20往復表示までで、追加ページ取得は対象外。ファイル配置・API・上限値は本リポジトリと今回の依頼に合わせる。

## 要望

| 要望ID     | 要望                                             | 期待する振る舞い                                                                                     | 対応REQ                            |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| WISH-V2-01 | 前のやり取りを踏まえ、同じ会話で追加質問したい   | 選択した会話の保存済み直近5往復と今回の質問のみをGeminiへ送り、返答を同じ会話へ追加保存する          | REQ-V2-003, REQ-V2-004, REQ-V2-006 |
| WISH-V2-02 | 話題ごとに新しい会話を作り、一覧から切り替えたい | 会話名を付けて新規作成し、会話一覧から会話を選択して独立した履歴・質問対象を切り替える               | REQ-V2-001, REQ-V2-002, REQ-V2-005 |
| WISH-V2-03 | 再読み込み後も保存した会話を選んで再開したい     | 会話と各質問・回答をV2専用DB表に保存し、再読み込み後に一覧から選び、履歴を読み込んで質問を続けられる | REQ-V2-002, REQ-V2-005, REQ-V2-007 |

## 共通制約・対象外

- Express、TypeScript、Neon/PostgreSQL、既存Gemini SDK、pnpmを継承する。
- TOP、TODO V1/V2、AI V1の既存機能・API・テーブルを維持する。
- 会話名はtrim後1〜50 Unicodeコードポイント、質問はtrim後1〜2,000 Unicodeコードポイント。
- JSONリクエスト本文は16 KiB以下。
- 画面は選択会話の最新20往復を古い順に表示する。Geminiへは同じ会話の保存済み最新5往復（古い順）と今回の質問だけを渡す。
- Gemini回答とDB保存の両方が成功したときだけHTTP 201。失敗時は入力保持・自動再送なし。
- V2 APIはPreview/Production等の公開環境では停止し、ローカル明示設定だけ許可する。
- ログイン、利用者ごとの権限/分離、会話名変更、会話削除、V1履歴移行は発展課題。

## トレーサビリティ概要

| WISH       | 要件                 | 設計                      | 実装タスク             |
| ---------- | -------------------- | ------------------------- | ---------------------- |
| WISH-V2-01 | REQ-V2-003, 004, 006 | DES-V2-003, 004, 006      | TASK-V2-04, 05, 07     |
| WISH-V2-02 | REQ-V2-001, 002, 005 | DES-V2-001, 002, 003, 005 | TASK-V2-02, 03, 06, 07 |
| WISH-V2-03 | REQ-V2-002, 005, 007 | DES-V2-002, 003, 005, 006 | TASK-V2-02, 03, 06, 07 |

詳細な受入条件は[`requirements.md`](requirements.md)、構成/API/DB設計は[`design.md`](design.md)、作業単位と検証は[`implementation-plan.md`](implementation-plan.md)に定義する。
