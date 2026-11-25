# リアルタイムチャット 実装手順書（確定版）

## トレーサビリティ

教材の正式WISH原本は未取得。WISH-CHAT-001〜005は依頼から整理した暫定ID。要件/設計/試験との対応表は `02_requirements.md`。この順序で実装し、各TASK完了後にテスト・Codex review・コミットを行う。

| TASK        | 内容・成果物                                                                       | 対応                                                              | 依存 |
| ----------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| TASK-CHAT-A | Express HTTP server統合、Socket.IO、EJS chat page、fail-closed gate                | REQ-001,015,016,018 / DES-001,002,008 / TST-01,02,05,30,35,36     | なし |
| TASK-CHAT-B | Chat DDL、adapter attachment DDL、Model、使い捨てPostgresでcatalog/DDL/history検証 | REQ-005,009,014 / DES-003 / TST-06〜10,33,34                      | A    |
| TASK-CHAT-C | Event validation、seat/lease検証とmessage/history SQL transaction、commit後配信    | REQ-002,006〜009,017〜020 / DES-002,003,005 / TST-11〜17,25,29,36 | B    |
| TASK-CHAT-D | atomic fixed 5 seats、30s lease/5s batch renewal、fencing、切断/reconnect/sync UI  | REQ-003〜005,010〜012,019,020 / DES-004,006 / TST-18〜25,28       | B,C  |
| TASK-CHAT-E | 2-process Adapter統合、barrier競合、異常終了、回帰/Preview readiness               | REQ-013,015,016,019,020 / DES-005,007,008 / TST-26〜36            | A〜D |

## TASK-CHAT-A — Express / EJS / Socket.IO

- **対象:** `package.json`, `pnpm-lock.yaml`, `src/app.ts`, `src/server.ts`, `src/httpServer.ts`, `src/apps/chat/chatRouter.ts`, `chatController.ts`, `chatSocket.ts`, `chatMiddleware.ts`, `chatTypes.ts`, `views/chat/index.ejs`, `public/chat/chat.js`, `public/chat/chat.css`, tests.
- **実装:** EJS `GET /chat`; common `node:http` server + Socket.IO; local server listens same instance. Browser uses Socket.IO-served client asset compatible version and `transports:['websocket']`. `maxHttpBufferSize=16*1024`. All chat handshake/events default disabled; only explicit `NODE_ENV=development`, `CHAT_DEMO_ENABLED=true`, `VERCEL_ENV` absent is locally allowed. Other app gates unchanged. Username/comment rendered as `textContent`.
- **確認:** GET `/chat` render, CSS/JS and socket client asset; one local socket handshake when enabled; disabled handshake denied with zero DB calls; existing TOP/TODO/AI/API/404 tests.
- **完了:** branch test clean, middleware order and root app unaffected, no Preview/Production enablement.

## TASK-CHAT-B — DDL / Model / history

- **対象:** `sql/chat/050_create_chat_tables.sql`, `sql/chat/051_create_chat_adapter.sql`, `src/apps/chat/chatModel.ts`, `chatTypes.ts`, `sql/README.md`, database tests.
- **実装:** `chat_messages BIGINT identity` with room, username/comment constraints, created_at and retrieval index; five fixed slot rows; `chat_socket_io_attachments` exact adapter table definition for pinned Postgres Adapter package. No existing table modification. `chatModel` exports history, claim/renew/release, insert and lease validation helpers as transactions. Regular queries reuse `requirePool()`; adapter obtains a dedicated direct/session-capable pool, not the Neon transaction pool.
- **確認:** disposable PostgreSQL: fresh apply, rerun, table/columns/type/identity/check/index/default exact catalog diff; wrong same-name object stops without drop/alter; 0/1/20/21 history order; simultaneous fixed-seat claims; adapter attachments DDL compatible with pinned package.
- **完了:** exact DDL invariants are test-covered. Never execute against Neon in this implementation.

## TASK-CHAT-C — validation / persisted send / broadcast ordering

- **対象:** `chatController.ts`, `chatService.ts`, `chatModel.ts`, `chatSocket.ts`, server tests.
- **実装:** Username trim 1–30 code points, comment trim 1–2000. JSON event object <=16 KiB. Revalidate membership and lease in the same SQL transaction as INSERT/RETURNING. Snapshot valid recipient Socket IDs in transaction; commit; then Postgres Adapter targeted broadcast. Sender gets ack only after commit. If commit fails no event. If adapter failure after commit, return `delivery:'unconfirmed'`; never local fallback or claim all clients received.
- **確認:** boundary/XSS/malformed input no DB; `deferred Promise` no ack or emit precommit; DB rollback no emit; sender included once by ID dedupe; adapter unavailable does not local-broadcast.
- **完了:** DB save and transport publish statuses are separate, safe errors, no content logs.

## TASK-CHAT-D — seating / lease / reconnect / history UI

- **対象:** `chatModel.ts`, `chatService.ts`, `chatSocket.ts`, `public/chat/chat.js`, Playwright and server tests.
- **実装:** 固定slot 1〜5; 30s expiry, batch renew each 5s using DB clock; random UUID fencing token. Same socket duplicate join returns existing lease; concurrent join handler serializes. Check `socket.connected` after each async step; failure/disconnect compensation releases exact token. Every history/send uses same transaction lease validation; broadcast targets only DB-active socket IDs; local expiry monitor removes expired local sockets. Reconnect is new seat attempt; full response permits manual retry. 10s fixed latest-20 history reconciliation and rejoin recover adapter misses; merge by decimal BIGINT id, chronological order, max 20.
- **確認:** five/sixth, same-socket concurrent joins, disconnect during delayed history, graceful release, expired process lease, stale token release, expired socket forbidden, reconnect, history/live/ack race and duplicate rendering.
- **完了:** global seats never exceed 5 under transaction barrier; outage fails closed; no automatic message resend.

## TASK-CHAT-E — multiple processes / adapter / regression

- **対象:** `httpServer.ts` adapter health/status, integration harness/scripts, tests, `docs/chat/05_test_spec.md`, `06_test_results.md`, optionally `.env.example` names only and Vercel route proposal only after evidence.
- **実装:** two independent Node processes use shared disposable PostgreSQL Adapter + seat DB. Adapter health is checked across peers; degraded system blocks new joins/sends; a post committed during propagation failure is `unconfirmed`, not local-emitted. History sync reconciles missed rows. Vercel deployment remains default-disabled and no deployment/env/protection changes are performed.
- **確認:** cross-process bidirectional posts, one DB row / one display each, five seats, last-slot race from four seats, six rejection, force kill + lease expiry, adapter/listener kill and restore, history recovery, DB outage, TOP/TODO/AI/404 regression, all static security checks.
- **完了:** local integration evidence distinguished from real Neon and protected Preview (both remain unrun); all automatic checks pass. If Vercel route/Neon session behavior is unresolved, document manual procedure and retain fail-closed—do not remove multi-instance requirement.

## 共通作業サイクル

各TASKの開始時にREQ/DES/TSTを確認。実装後に該当testと `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`, `git diff --check`を実行し、Codex self-reviewでcritical/high issueを修正・再確認する。結果を `06_test_results.md` にTaskごとに記録し、変更対象だけをコミット。E2E/DB/2-processは環境と結果を区別する。

## Stop conditions

- DDL mismatch、transaction test failing、atomic seat proof failing -> later task/blocking issueとして修正し、次へ進まない。
- Adapterのdelivery stateを検知できないときは成功配送を装わず、local fallbackもしない。
- direct/session Neon listener viability、Vercel route/protection/maxDurationはローカルから確定不能。実環境の設定変更なしでできる実装とテストは完了し、未検証/停止状態を明記する。
