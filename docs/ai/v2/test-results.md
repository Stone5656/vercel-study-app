# AI会話アプリ V2 試験結果

## 試験方針

- V2実装branch: `feature/ai-app-v2-implementation`
- 基点main: `42db3e39e4f1eea117b0c2a74d6b8b61d55f8966`（PR #10 squash merge）
- 実Gemini通信・Neon DDL適用/読み書きは禁止。Gemini SDK境界、DB Modelは依存注入mockを基本とする。
- DDLは使い捨てPostgreSQLでのみ試験し、Neonの結果と同一視しない。
- 実DB依存のTODO E2Eは自動実行しない。TODO server testsは回帰実行する。
- 合格は実施した主体・方法の範囲だけを指す。未試験を成功扱いしない。

## TASK-V2-01 ベースライン（2026-11-25）

| コマンド            | 結果                                |
| ------------------- | ----------------------------------- |
| `pnpm lint`         | 成功                                |
| `pnpm typecheck`    | 成功                                |
| `pnpm format:check` | 成功                                |
| `pnpm test`         | 70/70成功、9 suites、fail 0、skip 0 |
| `pnpm build`        | 成功                                |
| `git diff --check`  | 成功                                |

既存構成はExpress 5/TypeScript ESM、`src/app.ts`、共有`requirePool()`、V1 AI router、TODO V1/V2。V2コード/DDLなし。既存実機Neon/Gemini、Vercel Dashboard、実DB TODO E2Eは未確認。

## 要件別試験状況

| 要件                             | 状態   | 証跡                        |
| -------------------------------- | ------ | --------------------------- |
| REQ-V2-001 会話作成              | 未実施 | TASK-V2-03以降で記録        |
| REQ-V2-002 一覧/再開             | 未実施 | TASK-V2-03/04/06以降で記録  |
| REQ-V2-003 履歴保存/最新20       | 未実施 | TASK-V2-02/04/06以降で記録  |
| REQ-V2-004 最新5往復のGemini文脈 | 未実施 | TASK-V2-05以降で記録        |
| REQ-V2-005 入力/16KiB            | 未実施 | TASK-V2-03/05/07以降で記録  |
| REQ-V2-006 AI→DB commit→201/競合 | 未実施 | TASK-V2-05/07以降で記録     |
| REQ-V2-007 UI状態                | 未実施 | TASK-V2-06/07以降で記録     |
| REQ-V2-008 V2 DB分離             | 未実施 | TASK-V2-02以降で記録        |
| REQ-V2-009 XSS/秘密              | 未実施 | TASK-V2-06/07/08以降で記録  |
| REQ-V2-010 公開停止/回帰         | 未実施 | TASK-V2-03/08以降で記録     |
| REQ-V2-011 固定エラー契約        | 未実施 | TASK-V2-03〜05/08以降で記録 |

## 実環境確認（未実施）

- Neon DDL適用、実DB insert/select/rollback、対象branch/database catalog照合
- 実Gemini API通信/APIキー設定確認
- Vercel Preview/Production設定変更または実APIリクエスト
- 実DBを使うTODO E2E

実Neon/実Geminiの動作確認手順はREADMEと本設計に記載し、利用者の明示承認と対象環境確認後に別途行う。
