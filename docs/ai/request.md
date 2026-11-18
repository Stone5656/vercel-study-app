# AI質問機能 要望書

## 1. 文書の位置づけ

この文書は、2026-11-18に提示された「AI質問アプリ実装指示書」を、現在の`main`ブランチ（`65a1839`）で確認した構成に合わせて整理した要望書である。今回の作業範囲は文書整備とTASK-01までとし、TASK-02以降は承認後に着手する。

## 2. 要望

- 既存のExpress / TypeScript / EJSアプリに、Gemini APIを利用する独立したAI質問機能を追加する。
- `/ai`から質問し、Expressサーバー経由でGeminiから回答を取得する。
- 回答をNeon PostgreSQLへ保存できた場合だけ成功応答を返す。
- 保存済みの質問・回答・作成日時を最新20件表示する。
- 入力、本文サイズ、Content-Type、不正JSONを検証し、安全な固定形式でエラーを返す。
- 質問送信中の二重送信を防ぎ、成功時だけ入力を消去する。
- `AI_DEMO_ENABLED`でAI APIだけを停止でき、Productionでは常に停止する。
- APIキーや内部例外をクライアントへ渡さない。
- TODO V1/V2、共有DB Pool、DB確認画面を変更・破壊しない。
- 外部AIとDBを依存注入で分離し、実通信なしの自動テストを可能にする。

## 3. 既存構成との整合性調査

| 項目           | 確認結果                                                             |
| -------------- | -------------------------------------------------------------------- |
| ブランチ       | `main`。`HEAD`と`origin/main`はいずれも`65a1839`                     |
| Express        | `src/app.ts`がアプリ、`src/server.ts`がlistenを担当                  |
| JSON解析       | `src/app.ts`の共通`express.json()`がTODOルーターより先に登録済み     |
| DB             | `src/db.ts`の共有`Pool`と`requirePool()`を確認                       |
| TODO           | V1は`src/apps/todo/`、V2は`src/apps/todo/v2/`に分離                  |
| テスト         | Node.js Test Runner / Supertest / Playwrightを確認                   |
| 未コミット変更 | 調査開始時点で`.devcontainer/Dockerfile`に既存変更あり。今回触れない |

AI専用16KiB JSON制限を有効にするには、AIルーターを共通`express.json()`より前に登録し、そのルーター内部へ専用JSONパーサーとエラーハンドラーを置く必要がある。TODOの解析順は変更しない。

## 4. 公開要望書との関係

講師の公開要望書（[hanari-teacher/Ai-drive-Project2026](https://github.com/hanari-teacher/Ai-drive-Project2026/blob/main/docs/ai/request.md)）には、AI画面、サーバー経由のAI呼出し、エラー処理、レイヤー分離、秘密管理、既存機能への非影響が記載されている。一方、公開版には`WISH-AI-001〜014`の識別子は確認できなかった。

したがって、`WISH-AI-*`を新規に割り当てたり内容を推測したりしない。本リポジトリでは今回提示された指示書を一次仕様とし、追跡には`REQ-AI-*`と`DES-AI-*`を使用する。配布要望書原本の所在は未確認事項とする。

## 5. 未決事項

- 履歴の保存期間、削除日、削除主体
- Previewでアクセス保護済みと判断する具体的な確認手順と承認者
- VercelプランごとのFunction実行上限と30秒タイムアウトの適合性
- 実Neonで既存`ai_qa_logs`が存在する場合の定義差分
- 実Gemini、実Neonを用いる検証の実施時期と費用負担
