# リアルタイムチャット 試験仕様書（草案）

## 1. 試験レイヤーの区別

- **Unit/server test**: injected socket/service/model and Node test runner. No external services.
- **Disposable PostgreSQL**: DDL, constraints, transaction, ID/order, lease competition. Never Neon production.
- **Local multi-process**: two independent Node processes with shared adapter/presence DB and independent Socket.IO clients.
- **Browser E2E**: Playwright, two browser contexts/tabs. May use local server and disposable DB. No Gemini/AI auto-response.
- **Protected Preview**: deployment-specific WebSocket upgrade, routing, max duration/reconnect, cross-instance behavior, protection scopes. Only after access protection is verified.
- **Manual user test**: separately identify operator, environment, date, observed URL/status and DB target. Do not combine with automation.

No tests in this specification have been run by creation of this document. Results belong in `06_test_results.md`.

下表の短縮表記 `REQ-nnn` は `REQ-CHAT-nnn`、`TASK-A`〜`TASK-E` は `TASK-CHAT-A`〜`TASK-CHAT-E` を表す。

## 2. Test cases / traceability

| TST    | Test / setup                                                                              | Expected result                                                                                      | Trace                           |
| ------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| TST-01 | `GET /chat/` local                                                                        | chat page returned; static asset URLs load                                                           | REQ-001, TASK-A                 |
| TST-02 | Socket connection while chat disabled/unconfigured                                        | upgrade or join denied with safe fixed contract; no DB/history                                       | REQ-015, TASK-A                 |
| TST-03 | Two Socket.IO clients join same room and exchange messages both ways                      | both receive each stored event exactly once incl sender                                              | REQ-002,007,010,013; TASK-C,D,E |
| TST-04 | DB query for TST-03 posts                                                                 | one committed row per accepted post, generated IDs distinct                                          | REQ-007; TASK-C                 |
| TST-05 | TOP/TODO V1/V2/AI V1/V2, existing 404 and JSON parse failure smoke test                   | prior responses and error format unchanged                                                           | REQ-016; TASK-A,E               |
| TST-06 | disposable DB create DDL on empty schema                                                  | expected tables/checks/indexes/identity/default present                                              | REQ-005,014; TASK-B             |
| TST-07 | run same DDL a second time                                                                | idempotent success, no duplicate seat slots or damage                                                | REQ-011,014; TASK-B             |
| TST-08 | precreate same-name constraint/index with wrong definition then apply/check script        | stop with explicit mismatch; no object alteration/drop                                               | REQ-014; TASK-B                 |
| TST-09 | history with 0, 1, 20, 21+ rows                                                           | at most 20, SQL newest `(created_at DESC,id DESC)`, client chronology oldest-first                   | REQ-005; TASK-B                 |
| TST-10 | equal `created_at`, adjacent ids                                                          | deterministic tie-break by ID descending before returned reversal                                    | REQ-005; TASK-B                 |
| TST-11 | username missing/wrong type/empty/spaces/1/30/31 code points                              | valid boundaries accepted; invalid rejected, no seat/history                                         | REQ-002,014; TASK-C             |
| TST-12 | comment missing/wrong type/empty/spaces/1/2000/2001 code points, including astral Unicode | valid codepoint boundaries accepted; invalid rejected, no DB/emit                                    | REQ-006,014; TASK-C             |
| TST-13 | oversize socket event payload and unknown keys/malformed object                           | server rejects safely; no persist/broadcast; event loop healthy                                      | REQ-006,017; TASK-C             |
| TST-14 | attempt `<script>` / HTML in username and comment                                         | DOM displays literal text, no script executed                                                        | REQ-014; TASK-C,D               |
| TST-15 | delay DB INSERT promise before commit                                                     | no sender success ack or broadcast until commit resolves                                             | REQ-007; TASK-C                 |
| TST-16 | model insert failure / transaction rollback                                               | no room broadcast, sender gets fixed DB error, one failed operation                                  | REQ-008; TASK-C                 |
| TST-17 | send while socket never joined or after seat invalidation                                 | rejected; no DB write/event                                                                          | REQ-003,007; TASK-C,D           |
| TST-18 | 5 concurrent sockets join                                                                 | all 5 get seat + history                                                                             | REQ-004; TASK-D                 |
| TST-19 | 6th socket joins after five occupied                                                      | ROOM_FULL; no history, no room membership, no receive/send                                           | REQ-003,004; TASK-D             |
| TST-20 | disconnect a seated client then another client joins                                      | released slot can be acquired once                                                                   | REQ-011; TASK-D                 |
| TST-21 | abruptly terminate server holding seats, wait lease threshold, then join                  | stale seats reclaimed by DB time; never >5 active valid leases                                       | REQ-011; TASK-D,E               |
| TST-22 | Socket.IO auto reconnect after server restart/function close                              | client reconnects, repeats join, history restored, no automatic pending post resend                  | REQ-012; TASK-D,E               |
| TST-23 | delay history SELECT while a new DB-backed event arrives                                  | client merges by ID, no duplicate, ascending display, <=20 messages                                  | REQ-010; TASK-D                 |
| TST-24 | return same message by join history, broadcast and sender ack                             | one rendered message (ID keyed upsert)                                                               | REQ-010; TASK-D                 |
| TST-25 | seat store/lease renewal DB outage                                                        | new join/send rejected; local-only fallback not used; cleanup is idempotent                          | REQ-008,011,015; TASK-D         |
| TST-26 | two server processes, clients connected one to each, each sends                           | cross-process bidirectional event propagation                                                        | REQ-013; TASK-E                 |
| TST-27 | shared DB has 4 occupied seats; two processes concurrently admit 2 clients                | exactly one succeeds, total never exceeds 5                                                          | REQ-004,013; TASK-E             |
| TST-28 | one process exits without cleanup; remaining process sees expired lease                   | lease recovered after configured expiration, other seats unaffected                                  | REQ-011,013; TASK-E             |
| TST-29 | adapter connection goes down during a post                                                | no false delivery guarantee; DB persistence/history can reconcile; failure logged safely             | REQ-008,013; TASK-E             |
| TST-30 | inspect Vercel Socket.IO client config                                                    | WebSocket-only transport and Function path; no polling                                               | REQ-013,015; TASK-E             |
| TST-31 | protected Preview connection and deliberate Function max-duration reconnect               | protection covers upgrade path; reconnect to possibly different instance rejoins and reloads history | REQ-012,015; TASK-E             |
| TST-32 | verify production/preview disabled config + direct handshake attempt (no post)            | chat APIs/Socket stop; page behavior per policy; no DB access                                        | REQ-015; TASK-E                 |
| TST-33 | inspect Neon adapter connection and load                                                  | LISTEN uses session-capable endpoint; actual per-instance connections within branch/project limit    | REQ-013,015; TASK-E             |
| TST-34 | static security review                                                                    | no credentials in browser; safe text DOM; no message/secret logs; parameterized SQL                  | REQ-014; TASK-E                 |
| TST-35 | Vercel root route regression and function routing                                         | `/`, TODO V1/V2, AI V1/V2, `/chat/`, 404/static assets route to expected handlers                    | REQ-001,016; TASK-A,E           |
| TST-36 | send a chat post while observing the chat service boundary                                | user post only; no AI service/Gemini call, generated answer, or AI V1/V2 history access              | REQ-018; TASK-A,E               |

## 3. Required evidence record

Each test result records TST ID, layer (unit / disposable DB / local multi-process / browser / Preview / manual), command or exact manual steps, test count/pass/fail, date/time+timezone, build/commit ID, DB type/branch only (never connection string), and limitations. Preview evidence states how access protection covered both HTTP and WebSocket upgrade without recording secrets or untrusted sessions.

Tests needing actual Neon, Redis, Vercel upgrade, Fluid Compute or user interaction remain `NOT RUN` until executed. Unit mock success does not imply shared DB or deployed Socket.IO success. A DB test on disposable Postgres does not prove Neon PgBouncer/direct endpoint compatibility.
