# リアルタイムチャット 試験結果記録テンプレート

## 現在の状態

PR #13で仕様文書を確定するための資料。chat implementation/DDL/adapters/testsはまだ作成していない。よって **TST-01〜TST-40はすべてNOT RUN**。このbranchで実施した既存アプリの103 server test/lint/typecheck/buildは、Chat testのPASSではない。

## 実行環境

| 項目                                       | 記録                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| Branch / commit                            | docs branch `feature/realtime-chat-docs` / 記録時点PR13 head |
| Node.js / pnpm                             | Chat test未実施のため記録なし                                |
| DB                                         | 未接続。Neon DDL未実行                                       |
| Vercel project/runtime/maxDuration         | 未確認                                                       |
| Preview protection (page/socket handshake) | 未確認                                                       |
| Chat package/adaptor version               | 未導入                                                       |

## TST-01〜TST-40

| 試験           | 状態    | 実測結果                                     |
| -------------- | ------- | -------------------------------------------- |
| TST-01〜TST-40 | NOT RUN | Chat実装前。taskごとの実測結果を追記すること |

## 今後必ず区別する証跡

1. Unit/server mocks
2. Playwright browser test with real local Socket.IO
3. Disposable PostgreSQL schema/transaction tests
4. Two independent local Node server processes and a shared disposable PostgreSQL Adapter
5. Operator manual tests against Neon branch (never include credentials)
6. Protected Vercel Preview and actual function duration/route tests

Disposable PostgreSQL success does not prove Neon direct endpoint, Preview, or public protection. Adapter mocked success does not prove cross-process event delivery. A committed DB row does not prove each participant received a live event.

## 記録フォーマット

```text
TST-ID:
State: PASS / FAIL / BLOCKED / NOT RUN
Layer: unit / browser / disposable PostgreSQL / multi-process / Neon manual / Vercel Preview
Commit:
Date/time and timezone:
Command or exact steps:
Test count / pass / fail:
Observed behavior:
DB target (kind and branch/database label only; never URL):
Evidence location (no credentials or message body):
Limitations / next action:
```
