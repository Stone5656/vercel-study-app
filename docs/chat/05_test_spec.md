# リアルタイムチャット 試験仕様書（確定案）

## 1. 試験レイヤーと未実施扱い

- **Unit/server**: injected model/adapters and Node test runner.
- **Disposable PostgreSQL**: actual DDL/transactions/locking/constraints. No Neon.
- **Local multi-process**: two independent Node processes, actual Socket.IO client/server and shared disposable PostgreSQL Adapter.
- **Browser E2E**: Playwright, real local Socket.IO, multiple browser contexts. AI/Gemini never called.
- **Protected Preview/Vercel**: deployment routing, websocket upgrade, duration/reconnect, protections and Neon endpoint. Only after authorized protected test setup.
- **Manual**: user/operator, environment, date, endpoint/status and DB target separately recorded.

No test below is run merely by including it here. A mock test never implies Neon/Vercel success. TST-33 remains blocked until access to actual protected Preview; TST-34 is code/static review plus local test.

## 2. Test cases / traceability

| TST    | Test                                                                          | Expected / evidence                                                                                                | REQ / TASK        |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| TST-01 | GET `/chat`                                                                   | Router + Controller render EJS; CSS/JS served                                                                      | 001 / A           |
| TST-02 | Chat flag absent/false, or env not local                                      | handshake/join denied before database access                                                                       | 015 / A           |
| TST-03 | Two clients on same process, both directions                                  | each committed message appears once on each client including sender                                                | 007,010 / C,D     |
| TST-04 | Count DB rows for accepted messages                                           | exactly one row per accepted post, DB BIGINT ID returned as decimal string                                         | 007 / C           |
| TST-05 | Existing TOP/TODO V1/V2/AI V1/V2/404/JSON error checks                        | behavior and contracts unchanged                                                                                   | 016 / A,E         |
| TST-06 | Apply chat DDL in empty disposable DB                                         | all columns/types/identity/check/index/default/5 slots match design                                                | 005,011,014 / B   |
| TST-07 | Apply same DDL twice                                                          | succeeds idempotently; exactly five slots, adapter table valid                                                     | 011,014 / B       |
| TST-08 | Precreate same-name object with different check/index/key/default             | checker stops; does not ALTER/DROP existing object                                                                 | 014 / B           |
| TST-09 | History table with 0,1,20,21+ rows                                            | <=20 latest, database newest order, returned display oldest first                                                  | 005 / B,D         |
| TST-10 | Equal timestamp, differing BIGINT IDs                                         | deterministic `created_at DESC,id DESC` before result reversal                                                     | 005 / B           |
| TST-11 | Username invalid/missing/wrong type/blank; boundary 1,30,31 incl astral chars | accept 1/30 code points; reject others before seat/history                                                         | 002 / C           |
| TST-12 | Comment boundary 1,2000,2001, whitespace-only and astral Unicode              | accept 1/2000 after trim; reject invalid with no insert/emit                                                       | 006 / C           |
| TST-13 | Malformed event, unexpected fields, payload >16 KiB                           | safe validation ack; no query/emit; socket remains usable                                                          | 017 / C           |
| TST-14 | XSS strings for username/comment                                              | EJS values safely escaped; browser inserts text only; no execution                                                 | 014 / A,D         |
| TST-15 | Delay insert/commit promise                                                   | no success ack/broadcast until DB transaction commit resolves                                                      | 007 / C           |
| TST-16 | DB insert throws/rollback                                                     | sender gets fixed DB error; no target receives message                                                             | 008 / C           |
| TST-17 | Never joined, seat expired, or wrong fencing token sends/history sync         | `NOT_JOINED`; no row/history returned/event                                                                        | 003,019 / C,D     |
| TST-18 | Five simultaneous valid connections                                           | all admitted; shared DB shows at most five active leases                                                           | 004 / D           |
| TST-19 | Sixth connection                                                              | `ROOM_FULL`; no history, join, message send or receive                                                             | 003,004 / D       |
| TST-20 | Graceful disconnect and next join                                             | exact lease released, one replacement seat acquired                                                                | 011 / D           |
| TST-21 | Force-kill seat owner process                                                 | slot becomes reclaimable only after DB-clock lease expiry (~30s)                                                   | 011 / D,E         |
| TST-22 | Reconnect after disconnect/process recycle                                    | new connection re-admits/rejoins and loads history; no message auto-resend                                         | 012 / D,E         |
| TST-23 | History response delayed while new event arrives                              | client merges by decimal BIGINT ID, no duplicates, chronological max20                                             | 010,019 / D       |
| TST-24 | Same post appears from history, broadcast, and ack                            | UI displays exactly once                                                                                           | 010 / D           |
| TST-25 | DB fails during claim/renew/history/send                                      | deny action; no local seat/count fallback; cleanup idempotent                                                      | 003,008,019 / C,D |
| TST-26 | Two independent processes, clients on each, send both ways                    | Postgres Adapter delivers cross-instance; one DB row per post                                                      | 013 / E           |
| TST-27 | Four seats active; synchronize two last-slot claims in separate processes     | exactly one new admission succeeds (5 total)                                                                       | 004,013 / E       |
| TST-28 | Old release delayed until same slot reclaimed with new token                  | old release affects zero rows; new seat still valid                                                                | 011,019 / D,E     |
| TST-29 | Disconnect during delayed claim/history and kill process mid-join             | compensating exact-token release; if process dies, expiry reclaims seat                                            | 011,019 / D,E     |
| TST-30 | Expired socket remains physically connected and another post occurs           | excluded from DB-active Socket ID targets; history/send denied                                                     | 003,019 / D,E     |
| TST-31 | Disable adapter listener / cross-instance health                              | no local-only fallback; save vs delivery state distinct; recovery after listener restores                          | 020 / E           |
| TST-32 | Interrupt adapter publish after DB commit                                     | saved row remains; ack says delivery unconfirmed; later sync/rejoin recovers one row                               | 020 / E           |
| TST-33 | Protected Preview Socket.IO                                                   | WebSocket-only Function path upgrade; access protection covers handshake; stop flag denies public                  | 015 / E           |
| TST-34 | Neon/Function connection and effective duration review                        | record Neon session/direct endpoint, actual pool limits, instance/listener count, runtime/maxDuration; never infer | 013,015 / E       |
| TST-35 | Static secret/log/SQL audit                                                   | no browser DB/secret, no message text logs, parameterized SQL, no unsafe DOM                                       | 014,018 / E       |
| TST-36 | Chat post with AI service boundary spy                                        | no Gemini/AI call, answer generation, or V1/V2 history access                                                      | 018 / A,E         |
| TST-37 | Same Socket sends concurrent duplicate `chat:join`                            | one fixed slot and same token/lease; one history result or idempotent ack                                          | 004,019 / D       |
| TST-38 | Cut socket after seat claim while history query is pending                    | no history ack/room admission after disconnect; compensation release; slot reusable                                | 009,011,019 / D   |
| TST-39 | Ten-second history sync after adapter outage                                  | saved unseen messages arrive once; max20 order preserved; no local fallback                                        | 020 / D,E         |
| TST-40 | Check runtime intervals and adapter heartbeat                                 | lease TTL 30s, renewal batch interval 5s, reconcile 10s; test tolerates DB timing deterministically                | 011,020 / D,E     |

## 3. Test evidence format

For every TST record layer, command/procedure, commit, date/time/timezone, count/pass/fail, exact observed outcome, DB kind (disposable/Neon branch name only), and limitations. Do not write connection strings or secrets. `PASS` applies only to named layer. Required categories: automated unit, browser mock/real local socket, disposable DB, multi-process, user manual, protected Preview/Neon.

## 4. Operational procedure for real environments

Do not execute Neon DDL in this task. After DDL review/approval, operator chooses a disposable Neon branch, checks branch/database identity, compares `pg_get_constraintdef`, `pg_get_indexdef`, `pg_index`, `pg_get_expr`, identity/default and exact five seat rows; mismatch means stop, no auto repair. Only then manually apply `sql/chat/050...` and `051...` after separate approval. For Vercel, first verify auth protection covers HTML and websocket upgrade, node runtime/Fluid/maxDuration, routing and direct Neon endpoint capacity. Keep `CHAT_DEMO_ENABLED` off until those checks pass. Never send AI prompts from this chat.
