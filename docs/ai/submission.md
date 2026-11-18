# AI質問アプリ 提出概要

最終更新: 2026-11-18

## 1. アプリ概要

Express 5 / TypeScript / EJSのWebアプリへ単発のAI質問機能を追加した。画面は`/ai/`で、質問をサーバー経由でGeminiへ送信し、回答がNeonへ保存された後に結果を返す設計である。

## 2. 機能一覧

- 質問入力、非同期送信、入力検証、通信中/エラー状態表示
- 最新20件の質問・回答・作成日時を履歴表示
- 同時刻の履歴はID降順
- 質問・回答はHTMLとして解釈せず、通常テキストとして表示
- TODO V1/V2はAI機能と独立して動作
- ProductionではAI質問・履歴APIを停止

## 3. アーキテクチャ

- Browser: 静的HTML/CSS/JavaScript (`public/ai/`)
- Web: Express Router / Controller / Service / Model
- AI: Google公式`@google/genai`を使うサーバー側Service
- Database: `pg`共有PoolとNeon PostgreSQL
- DDL: `sql/ai/030_create_ai_qa_logs.sql`。TASK-08では未実行
- Deployment: Vercel。専用`vercel.json`は追加していない

## 4. Gemini APIの利用方法

サーバー環境変数`GEMINI_API_KEY`と`GEMINI_MODEL`を使い、現在の質問だけを`models.generateContent`へ渡す。出力上限は1024 tokens、SDK HTTP request timeoutは30秒、SDK retry attemptsは1、automatic continuationとautomatic function callingは無効。API失敗・空回答はDBへ保存しない。

ローカル模擬回答は`AI_DEMO_ENABLED=true`、`AI_MOCK_ENABLED=true`、`VERCEL_ENV`未設定で選ぶ。ローカル実Geminiはdemo=true、mock=false、API key/model設定が必要。Previewではアクセス保護を設定画面と匿名リクエストで確認するまで`AI_DEMO_ENABLED=true`にしない。ProductionはtrueでもAPI停止。

## 5. Neonのデータ構造

`ai_qa_logs`にidentity id、prompt、response_text、created_atを保存する想定。promptの長さ/空白、回答の空白、最新20件取得用複合indexを定義している。DDLの同名CHECK式、PK構成列、index key/order/direction、created_at defaultの完全照合が未完了で、実Neonへ適用していない。照合には`pg_get_constraintdef`、`pg_get_indexdef`、`pg_index`、`pg_get_expr`を用い、不一致時に適用を停止する。

## 6. セキュリティ設計

- API keyとDB URLはサーバー環境変数のみで保持
- public JavaScriptへSDKや秘密値を配信しない
- UIはtextContentによる安全なDOM描画
- 入力のserver-side validation、16KiB JSON制限
- エラー本文は固定メッセージ
- Preview保護はVercel Deployment Protectionを前提とし、未確認時はAIを有効にしない
- ProductionのAI routerは外部AI/DB呼出しより前に停止

## 7. テスト結果

TASK-08で実行するlint、typecheck、format check、Node test runner、build、AI Playwright、diff checkの実測値を[`test-results.md`](test-results.md)へ記録する。Server/Playwrightテストは依存注入・HTTP mockを使うため、実Gemini/Neonの成功を意味しない。

## 8. 未確認事項

- Vercel Dashboardのruntime Node version、Fluid Compute、実効Function maxDuration
- Vercel環境変数の登録有無とPreview/Production scope
- Deployment Protection exceptionsとcanonical Preview URL
- 実Geminiリクエスト
- Neon DDL適用、INSERT、SELECTによる永続化
- 実DB依存のTODO E2E
- 履歴保存期間と削除運用

TASK-08で匿名GETしたPreview deployment URLの`/`、`/ai/`、`/api/ai/history`はいずれもSSOへredirectした。これは該当デプロイ/URL/pathでの確認であり、Vercel Dashboard全設定やcanonical aliasの証明ではない。Production deploymentの履歴GETもSSO redirectのため、アプリの停止レスポンス自体は実環境で未確認。

## 9. 今後必要な作業

1. Vercel DashboardでProject/repository接続、Node runtime、Fluid Compute、実効duration、Environment Variable scope、Protection scope/exceptionsを確認する。
2. Previewの全利用URLとAPI routeが第三者から保護されていることを確認する。未確認の間はAIを有効化しない。
3. Neonの対象branch/databaseを確認し、catalog定義照合と差分停止条件を含むDDLをレビュー・承認してから適用する。
4. 少数の手動実Gemini質問、Neon保存、履歴再取得を実施する。
5. 履歴保持期間/削除運用を決め、DB E2EとPreview結合試験を別途記録する。

## 10. 実環境識別記録

- main基点: `79e696c83e58d6ade664615be5a39b0d982cdb72`（PR #8 merged）
- GitHub deployment metadata上のProduction SHA: `79e696c83e58d6ade664615be5a39b0d982cdb72`
- GitHub deployment metadata上のPreview SHA: `9b6a1cab55f1c7a4bb1c1aef5d74f2cd13f2fe13`
- deployment metadataのProject label: `vercel-study-app`
- Vercel Dashboard設定の認証済みread-only確認: 利用不可、未確認
