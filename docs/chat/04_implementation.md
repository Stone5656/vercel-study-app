# リアルタイムチャット 実装手順書（草案）

## トレーサビリティ

`WISH-CHAT-001〜005` は暫定分類（教材の正式原本未確認）。以下 TASK と各 REQ/DES/TST の対応で進める。実装コード、依存、DDL作成は今回の文書作成作業には含まれない。

| Task        | 内容                                                                                                                                                           | 対応要件・設計                                                             | 依存                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| TASK-CHAT-A | 既存アプリの回帰基準を測り、Express + shared Node HTTP server + Socket.IO integration / local startup / `/chat/` static routing を実装。公開停止をdefault-deny | REQ-CHAT-001,015,016,018; DES-CHAT-001,008; TST-01〜05,22,35〜36           | なし                                   |
| TASK-CHAT-B | chat DDL案のレビュー後、使い捨てPostgreSQLで新規/再実行/不一致停止を試験。Modelの履歴取得・DTO実装                                                             | REQ-CHAT-005,009,014; DES-CHAT-003; TST-06〜10,23                          | A、schema review                       |
| TASK-CHAT-C | join/message validation、DB transaction、commit前broadcast禁止、ack/event実装                                                                                  | REQ-CHAT-002,003,006〜009,014,017,018; DES-CHAT-002,003,005; TST-11〜17,36 | B                                      |
| TASK-CHAT-D | global 5-seat atomic lease、disconnect/cleanup/reconnect、history/live mergeとdedupe                                                                           | REQ-CHAT-001,003〜005,010〜012,014; DES-CHAT-004,006; TST-18〜25           | B,C                                    |
| TASK-CHAT-E | multi-instance broadcast/seat contention/abnormal-exit recovery、full regression/security/Preview readiness判定                                                | REQ-CHAT-007,008,011〜013,015,016,018; DES-CHAT-005,007,008; TST-26〜36    | A〜D、adapter/DB architecture approval |

## A. 既存アプリの動作確認と Socket.IO 統合

- 対象変更（候補）: `package.json`, `pnpm-lock.yaml`, `src/app.ts`, `src/server.ts`, `src/httpServer.ts`, `src/apps/chat/chatSocket.ts`, `public/chat/index.html`, `.gitignore`（必要な場合のみ）。
- 実装内容: 現在の lint/typecheck/build/server test baseline を取得。必要な Socket.IO server/client依存の互換版を固定。appと同じ `node:http` serverにSocket.IOをattach、local `src/server.ts` は共通serverをlisten。Vercel entry/route候補を別にし、公開停止middlewareをhandshake/event登録より先に適用。静的画面は`/chat/`で表示。環境未設定ではSocket接続・eventを拒否。
- テスト: Socket.IO clientでlocal connection; `/chat/`静的表示; guard disabled; TOP/TODO/AI routes unchanged; pnpm lock diffの範囲確認。
- 完了条件: Express HTTPとSocket handshakeが同一HTTP serverで動作し、デフォルト停止を確認。Vercelへの有効化はこの時点で行わない。

## B. DDL・Model・履歴取得

- 対象変更（候補）: `sql/chat/050_create_chat_tables.sql`, `src/apps/chat/chatModel.ts`, `src/apps/chat/chatTypes.ts`, `tests/server/chat-model.test.ts`, `sql/README.md`。
- 実装内容: DB schema/identity/timestamps/index/check/seat slots/adapter attachmentsをレビューし、既存データを破壊しない DDL。History queryはroom限定、newest-first LIMIT 20, response DTO oldest-first。Adapter's `LISTEN/NOTIFY` connectionは Neon PgBouncer transaction poolから分ける設計を実証しない限り採用保留。DDLはNeonへ実行しない。
- テスト: 使い捨てPostgreSQLでcreate/re-run/mismatch stop/catalog definitions, fixture履歴0/1/20/21件、同一日時tie-break、DTO ID/timestamp。
- 完了条件: DDLの再実行安全性と不一致停止、履歴件数・順序を自動確認。Neon実DBは別承認・手動適用。

## C. 投稿検証・DB保存・同一ルーム配信

- 対象変更（候補）: `src/apps/chat/chatController.ts`, `chatService.ts`, `chatModel.ts`, `chatSocket.ts`, `tests/server/chat-events.test.ts`。
- 実装内容: `chat:join`, `chat:message:send` payload/ack contract。username candidate 1-30 / comment 1-2000 code points; trim; payload bytes limit; membership/lease確認。Parameterized INSERT RETURNING transaction commit後だけroom emitし、senderもroom broadcastで受信。DB failureはsafe ackで配信なし。
- テスト: fake/injected model + socket test; test deferred transaction promise ensuring no emit/ack success pre-commit; DB throw no emit; invalid input no DB; text/XSS display safety.
- 完了条件: 正常/異常経路と保存→emit orderingがDBに依存しないtestで確認され、使い捨てPostgresで1 post = 1 row。

## D. 定員管理・切断・再入室・履歴同期

- 対象変更（候補）: `chatModel.ts`, `chatService.ts`, `chatSocket.ts`, `public/chat/app.js`, `tests/server/chat-seats.test.ts`, `tests/e2e/chat.spec.ts`。
- 実装内容: 5固定seatまたは同等のserializable/locked allocation transaction; fencing token; lease renewal / expires based on DB time; idempotent release; stale seat reclamation; reconnect starts join + history; 6th unjoined/no history/no send. History and live events ID-dedupe; one sorted latest20 view. Close or DB error fails closed.
- テスト: 5/6 client, disconnect seat release, reconnect restore, pending history/new event overlap, duplicate ack+broadcast, expired lease, competing test transactions.
- 完了条件: concurrent clients do not exceed five DB-allocated seats, all failures leave a recoverable seat state, reconnect is not silently treated as prior membership.

## E. 複数インスタンス対応・回帰試験

- 対象変更（候補）: adapter bootstrap/Neon connection config, Vercel Function entry and only if required routing config, `.env.example` (names only), security/regression tests, docs/results.
- 実装内容: Compare Postgres Adapter vs Redis Adapter in a written decision record. If Postgres Adapter chosen, verify a session-capable Neon endpoint and per-instance listener budget; never connect `LISTEN/NOTIFY` through transaction pool. If no acceptable persistent listener scale, stop and propose another topology. Cross-instance seating stays a distinct atomic DB concern. Vercel startup/server export and websocket-only route must be verified on protected Preview before any enablement.
- テスト: two independent server processes, cross-process bidirectional publish, DB initial 4 seats then concurrent join through two processes gives exactly one success, abrupt process termination lease recovery, adapter outage, Vercel deployment runtime/upgrade/reconnect; TODO/AI/TOP/404 regression.
- 完了条件: all `05_test_spec.md` mandatory tests pass with local, disposable PostgreSQL, and protected Preview evidence separated; public API disabled until explicit security approval. No Neon production writes.

## Task間の停止条件

各 Task で lint/typecheck/server tests/format/build and diff review; relevant E2E at that stage. DDL test uses disposable DB only. `TASK-CHAT-B` schema mismatch or `TASK-CHAT-E` Neon LISTEN/connection viability failure stops later deployment work; don't silently substitute local memory. Preview protection is not verifiable -> keep feature disabled. All WISH mapping remains provisional until source document is supplied.
