# リアルタイムチャット 試験結果記録（テンプレート）

## 状態

これは試験前の記録テンプレートである。文書作成時点でチャット実装・依存追加・DDL適用は行っていない。従って、ここに定義されたすべての試験は **未実施（NOT RUN）**。PR CIや既存アプリの試験成功を、チャット要件の合格と解釈しない。

## 実行環境記録

| 項目                                      | 記録             |
| ----------------------------------------- | ---------------- |
| Commit / branch                           | 未実施           |
| 実行日時・timezone                        | 未実施           |
| Node / pnpm                               | 未実施           |
| 試験レイヤー                              | 未実施           |
| DB種別・branch/database（接続秘密なし）   | 該当なし・未実施 |
| Vercel project/runtime/region/maxDuration | 未確認           |
| Deployment Protection（HTTP/upgrade双方） | 未確認           |

## TST-01〜TST-35 実施記録

| TST            | 状態    | 結果・証跡                                           |
| -------------- | ------- | ---------------------------------------------------- |
| TST-01〜TST-35 | NOT RUN | チャット機能は未実装。各ケースの実装後に個別記録する |

## 既存アプリ baseline

| 項目                       | 状態                      | 結果                                               |
| -------------------------- | ------------------------- | -------------------------------------------------- |
| `pnpm lint`                | NOT RUN in this docs task | 今回の範囲は文書のみ                               |
| `pnpm typecheck`           | NOT RUN in this docs task | 今回の範囲は文書のみ                               |
| `pnpm format:check`        | NOT RUN in this docs task | 文書整形検証はPR作成前に実施予定。結果をここへ追記 |
| `pnpm test`                | NOT RUN in this docs task | 既存コードは変更していない                         |
| `pnpm build`               | NOT RUN in this docs task | 既存コードは変更していない                         |
| TODO/AI/TOP/404 regression | NOT RUN in this docs task | チャット統合後に実施                               |

## 環境依存の未確認項目

- Protected PreviewでのWebSocket upgradeと Socket.IO Function path routing
- Vercel projectのNode runtime、Fluid Compute、実効 `maxDuration`、Function entry / route mapping
- WebSocket close-at-duration後の再接続先、同一room join、履歴復元
- Neonの採用接続endpointが Postgres Adapter の `LISTEN/NOTIFY` に適する session connectionであること
- Neon connection limitsとVercel instance scale-out時の listener + app Pool 合計
- Neon DDL適用、adapter補助tableの定義、seat lease同時更新、異常終了後の回収
- cross-instance event delivery、transaction commitとbroadcastの間のクラッシュ窓
- 公開環境のチャット停止guardと、既存AI/TODO機能が継続すること
- retention/deletion/abuse prevention policy

## 結果追記用フォーマット

```text
TST-ID:
State: PASS / FAIL / BLOCKED / NOT RUN
Layer: unit / disposable PostgreSQL / local multi-process / browser / protected Preview / manual
Commit:
Run date/time and timezone:
Command or procedure:
Count / passed / failed:
Observed result:
Evidence location (no secrets):
Limitations / follow-up:
```
