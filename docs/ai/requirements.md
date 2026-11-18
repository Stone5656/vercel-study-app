# AI質問機能 要件定義書

## 1. 機能・非機能要件

| ID         | 要件         | 受入条件                                                                                          |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------- |
| REQ-AI-001 | AI質問画面   | `/ai`を表示でき、TOPから遷移できる                                                                |
| REQ-AI-002 | 質問処理     | 現在の質問だけをExpress経由でGeminiへ送り、保存成功後に201を返す                                  |
| REQ-AI-003 | 履歴保存     | 質問、非空回答、作成日時を`ai_qa_logs`へパラメータ化SQLで保存する                                 |
| REQ-AI-004 | 履歴取得     | `created_at DESC, id DESC`で最新20件を返し、0件は正常な空配列とする                               |
| REQ-AI-005 | prompt検証   | 必須文字列をtrimし、Unicodeコードポイント数1〜2,000だけ許可する                                   |
| REQ-AI-006 | HTTP本文検証 | JSON以外は415、不正JSONは400、16,384バイト超過は413とし、AI/DBを呼ばない                          |
| REQ-AI-007 | 非同期UI     | 送信中表示、ボタン無効化、成功時だけ入力消去、失敗時保持、finally復帰を行う                       |
| REQ-AI-008 | UI安全性     | `res.ok`とJSON構造を検証し、質問・回答は`textContent`で表示して自動再送しない                     |
| REQ-AI-009 | 公開制御     | 未設定/falseは停止、Productionはtrueでも停止し、両AI APIへ503を返す                               |
| REQ-AI-010 | エラー契約   | 指定HTTP/codeと安全な固定文を返し、例外・SQL・認証情報を返さない                                  |
| REQ-AI-011 | Gemini設定   | `@google/genai`、指定モデル、1024 token、30秒、retry 1、継続無効、空回答失敗を使う                |
| REQ-AI-012 | 秘密管理     | APIキーはサーバー環境変数だけで扱い、配信物・Git・ログへ含めない                                  |
| REQ-AI-013 | 分離可能性   | Router/Controller/Service/Model/Middlewareを分離し、AIとDBをモック可能にする                      |
| REQ-AI-014 | 既存互換性   | TODO V1/V2、DB確認、共有Pool、Vercelルート構成を維持する                                          |
| REQ-AI-015 | DBスキーマ   | 非破壊DDLと取得用複合indexをSQLファイルに保存し、自動実行しない                                   |
| REQ-AI-016 | タイムアウト | 質問POSTはブラウザ45秒、履歴GETは15秒、サーバーAI通信30秒を基準とし、Vercel上限との整合を確認する |

## 2. API要件

### POST `/api/ai/ask`

- 入力: `{"prompt":"質問本文"}`
- 成功: HTTP 201、`success: true`と保存済みitem
- 処理順: 検証 → Gemini → 非空回答確認 → DB INSERT → 応答
- Gemini失敗時および空回答時はDBへ保存しない。

### GET `/api/ai/history`

- 成功: HTTP 200、`success: true`と`items`（最大20件）
- 0件は`items: []`。

### エラー

| HTTP | code                     | 条件               |
| ---- | ------------------------ | ------------------ |
| 400  | `VALIDATION_ERROR`       | 入力不正           |
| 400  | `INVALID_JSON`           | JSON解析失敗       |
| 413  | `PAYLOAD_TOO_LARGE`      | 本文上限超過       |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | JSON以外           |
| 502  | `AI_UNAVAILABLE`         | Gemini失敗・空回答 |
| 503  | `DB_UNAVAILABLE`         | DB接続・保存失敗   |
| 503  | `DEMO_DISABLED`          | AI機能停止         |
| 500  | `INTERNAL_ERROR`         | その他の内部エラー |

エラー本文は常に`success: false`と`error.code`、固定`error.message`を持つ。

## 3. DB要件

- `id INTEGER`自動採番PRIMARY KEY
- `prompt TEXT NOT NULL`、Unicodeコードポイント相当1〜2,000
- `response_text TEXT NOT NULL`、空文字不可
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `(created_at DESC, id DESC)`の複合index
- 既存同名テーブルの定義が異なる場合は変更せず報告する。

## 4. 環境別公開条件

| 環境       | 条件                         | 結果       |
| ---------- | ---------------------------- | ---------- |
| Local      | `AI_DEMO_ENABLED=true`       | 有効化可能 |
| Local      | 未設定、false、その他        | 停止       |
| Preview    | アクセス保護確認済みかつtrue | 有効化可能 |
| Preview    | 上記以外                     | 停止       |
| Production | すべて                       | 常に停止   |

Previewのアクセス保護確認は運用上の前提であり、環境変数だけから自動判定しない。

## 5. 未決事項

履歴保存期間、削除日、削除運用、Preview保護の確認責任者、実AI/DB試験の時期は未決である。

## 6. TASK-08受入状況（2026-11-18）

| 対象要件                | 状態                                      | 確認根拠・残件                                                                                                                  |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| REQ-AI-009 公開制御     | 自動テスト合格 / Production実環境は未確認 | SupertestでProduction停止と副作用0回を確認。匿名GETはProductionデプロイURLでSSOへリダイレクトされ、アプリ応答は取得していない。 |
| REQ-AI-012 秘密管理     | 静的確認                                  | `.env`ファイルの内容は開かず、追跡対象でないこと、tracked `.env`がないことを確認。Vercel環境変数の存在/scopeは未確認。          |
| REQ-AI-014 既存互換性   | 自動テスト合格                            | TODO V1/V2サーバーテストとAI停止中のTODO解析契約を確認。実DB E2Eは未実施。                                                      |
| REQ-AI-016 タイムアウト | 設計上の整合評価のみ                      | Gemini HTTP 30秒、POST 45秒、履歴GET 15秒。Function実効上限が未確認のため全体の時間内完了は未判定。                             |

TASK-08で文書上の運用手順と匿名GETによるデプロイ保護確認は整理した。実Gemini/Neonを含む結合試験とDashboard設定の確認は未完了であり、提出資料の整備をそれらの合格と同一視しない。
