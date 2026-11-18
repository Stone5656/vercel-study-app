# AI活用記録

## 2026-11-18 TASK-02

### 対象

REQ-AI-003, 004, 009, 010, 013, 015およびDES-AI-001, 003, 005, 006, 009。

### 調査・判断

- `src/db.ts`の`requirePool()`を再利用し、新しいPoolは作成しない。
- 共通`express.json()`より前というAIルーター位置を維持した。
- 今回はGET履歴APIに限定され、POST保存は禁止されているため、AI専用JSON parserは実装しなかった。既存計画との差分を`tasks.md`へ記録し、TASK-03へ延期した。
- DB例外と想定外例外を安全に区別するため、Model境界で`AiDatabaseError`を使用した。
- Controllerへ`AiHistoryModel`を注入し、Modelの行readerも差し替え可能にした。
- SQLは同名テーブルを自動変更せず、事前確認queryとDDL内安全確認を設けた。
- PostgreSQLは`char_length`、TASK-03のTypeScriptは`Array.from(...).length`を使う方針とし、UTF-16 code unitの`string.length`は採用しない。

### 採用しなかった案

- 実NeonへのDDL適用: SQL承認前のため不採用。
- Gemini SDK/通信: TASK-04範囲のため不採用。
- SQL formatter plugin追加: 不要な依存追加になるため不採用。
- DBエラーを文字列やdriver codeだけで判定: 内部実装依存と誤分類を避けるため不採用。

### 検証経過

1. 最初の全テストでは49/50件成功。TASK-01の有効時テストが既定履歴Modelへ到達し、環境内DB設定による接続を試みて503となった。
2. 秘密値は読み取らず、当該テストへfake Modelを注入して実DB経路を除去した。
3. 再実行で50/50件、7 suitesが成功。lint、型検査、format、buildも成功した。

### 未検証

- SQL構文と制約の実Neon上での実行
- 既存`ai_qa_logs`の有無・定義
- 実DBから返るTIMESTAMPTZのDTO変換
- Vercel Preview/Production
- T06〜T08およびTASK-03以降
