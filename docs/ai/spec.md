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

TASK-02ではGET履歴APIだけを実装したため、本文を持つPOST用のContent-Type検証、16KiB parser、JSON/sizeエラー変換は未実装である。これらは質問処理を実装するTASK-03で、共通parserより前のAIルーター内部へ追加する。

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

## 5. Gemini SDK設計（TASK-04で実装）

2026-11-18時点のGoogle公式資料で、モデルID`gemini-3.5-flash-lite`、`models.generateContent`、`GenerateContentConfig.maxOutputTokens`、`automaticContinuation: false`、`httpOptions.timeout`、`httpOptions.retryOptions.attempts`を確認した。

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

公式資料では`attempts`は初回を含み、0または1は再試行なしである。またAbortSignal/timeoutによるクライアント中断はサービス側処理の取消しを保証しない。TASK-04で実際に固定する`@google/genai`版の型定義と挙動を再確認し、型に存在しない設定を強制しない。

参照:

- [Google Gen AI SDK](https://googleapis.github.io/js-genai/)
- [GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)

## 6. UI設計

- 初期表示で履歴GETを1回実行する。
- 送信中フラグで同一画面の連打を防ぐ。
- `AbortController`の45秒を参考に待機するが、自動再送しない。
- timeout時は保存結果が不明な可能性を案内し、履歴確認を促す。
- 質問と回答はDOM生成後に`textContent`へ設定する。
- Markdown変換、streaming、`innerHTML`への値挿入は行わない。

## 7. Vercel実行上限

30秒のSDK timeoutに加えてDB保存時間が必要である。対象Vercelプロジェクトのプラン、Function runtime、`maxDuration`はリポジトリだけでは確認できないため未検証とする。TASK-08までに実設定を読み取り確認し、SDK timeoutより十分長いことを確認する。不要な`vercel.json`は追加しない。
