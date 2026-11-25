# リアルタイムチャット 設計書（確定案）

## 1. 設計状態・Design IDs

機能要件は `02_requirements.md` に確定した。教材の正式WISH原本は未取得で、WISH-CHAT-001〜005は依頼を整理した暫定ID。実Neon・Vercelの接続/route/limitに関する記述は設計方針であり、実環境での適合成功を示さない。

| DES          | 設計要素                                                         |
| ------------ | ---------------------------------------------------------------- |
| DES-CHAT-001 | Express/EJS/shared HTTP server/Vercel entry（§2）                |
| DES-CHAT-002 | Socket events、validation、admission・failure state（§3〜4, 10） |
| DES-CHAT-003 | 投稿/履歴DB transaction・DTO・read-after-write（§5）             |
| DES-CHAT-004 | 共有5 seat、lease/fencing、切断と回収（§6）                      |
| DES-CHAT-005 | Postgres Adapter、配信可観測性・障害復旧（§7）                   |
| DES-CHAT-006 | EJS画面、状態、再接続、重複排除（§2〜4, 9）                      |
| DES-CHAT-007 | Vercel実行時間・WebSocket transport・Neon接続容量（§8）          |
| DES-CHAT-008 | fail-closed公開制御と安全性（§10）                               |

VercelのWebSocket機能は2026-10-20にGA。Node.js/Expressでは`createServer(app)`へSocket.IOをattachしserverをFunction entryとしてexportする公式例がある。Socket.IO clientはFunction URL下のpathと`transports: ['websocket']`を使う。Vercel WebSocketは接続中Functionへpinされるが、次のconnection/reconnectが同一instanceへ行く保証はなく、Function最大時間で閉じる。[Vercel WebSockets](https://vercel.com/docs/functions/websockets) [GA告知](https://vercel.com/changelog/websocket-support-is-now-generally-available)

## 2. アプリ統合とファイル構成

既存 `src/app.ts` はExpress routes/static/EJSを持つappとして維持する。`src/server.ts` の `app.listen()` は直接使わず、`node:http` `createServer(app)` を一度だけ生成し、Socket.IO `Server` をattachする。ローカルはこのHTTP serverをlistenする。

```text
src/
  app.ts
  server.ts                         # shared httpServer をlisten
  httpServer.ts                     # createServer(app), Socket.IO初期化
  apps/chat/
    chatRouter.ts                   # GET /chat
    chatController.ts               # EJS render / socket request boundary
    chatService.ts                  # join/send/expiry/adapter orchestration
    chatModel.ts                    # transaction / fixed parameterized SQL
    chatMiddleware.ts               # chat専用fail-closed gate
    chatSocket.ts                   # event bind, lifecycle, per-socket serialization
    chatTypes.ts                    # DTO, event/ack types
views/chat/index.ejs
public/chat/chat.js
public/chat/chat.css
sql/chat/050_create_chat_tables.sql
sql/chat/051_create_chat_adapter.sql # adapter tableが必要な場合の候補
tests/server/chat-*.test.ts
tests/e2e/chat.spec.ts
tests/integration/chat-multi-process.test.ts
```

`GET /chat` は `chatRouter.ts` → `chatController.ts` → `res.render('chat/index', ...)` を通す。`/chat/` aliasは同Routerから同じrenderへ向けることを候補とし、EJS資産はExpress staticで配信。ユーザー名/コメントは`textContent`で描画する。

Vercel Node frameworkの公式例はFunction file（例`api/server.ts`）からHTTP serverをexportする方式。現行root Express deploymentにFunction entryを併存させる際のroute競合を、`/`, TODO, AI, `/chat`, socket handshakeを含むprotected Previewで実測する。必要ならFunction routing設定を追加提案するが、Zero Configで全pathとupgradeが届くとは推測しない。実効routeが判明するまではchat gateを停止にする。

## 3. Socket.IO event契約

全payloadはobjectであること、必須field、型、許可field、UTF-8 JSON byte長を検証。最大payloadは16,384 bytes。Socket.IO serverの`maxHttpBufferSize`も16 KiBに下げ、event boundaryでも再確認する。

| Direction / event               | Payload                            | Ack / behavior                                                                                                                                             |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client `chat:join`              | `{ username: string }`             | 成功: `{ok:true, roomId:'lobby', messages: ChatMessage[], occupied:number, capacity:5, leaseToken:string}`。二重joinは同socketの既存有効seat/historyを返す |
| Client `chat:message:send`      | `{ comment:string }`               | 保存commit成功後 `{ok:true, message:ChatMessage, delivery:'published'                                                                                      | 'unconfirmed'}`。deliveryは全client受信保証を意味しない |
| Client `chat:history:sync`      | `{ afterId?: string }`             | join済み/lease有効をDB transaction確認してから最新20件またはafterId差分を返す                                                                              |
| Client `chat:leave`             | `{}`                               | idempotent release; disconnectでも同じ解放関数を呼ぶ                                                                                                       |
| Server `chat:message:new`       | `ChatMessage`                      | 有効leaseのSocket IDだけをAdapter経由で対象にする。送信者も含む                                                                                            |
| Server `chat:delivery:degraded` | `{ reason:'ADAPTER_UNAVAILABLE' }` | UIは保存有無とlive delivery未確認を分けて表示し、history syncを実施                                                                                        |
| Server `chat:room:status`       | `{ occupied:number, capacity:5 }`  | DBでseat変更を確認できたときのみ通知                                                                                                                       |

`ChatMessage = { id:string, username:string, comment:string, createdAt:string }`。`id`は正の10進BIGINT文字列。ack/event両方の同じidはbrowserでupsert/dedupe。

error ackは `{ok:false,error:{code,message}}` で、固定安全文だけを返す。主なcode: `DEMO_DISABLED`, `ROOM_FULL`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `NOT_JOINED`, `DB_UNAVAILABLE`, `ADAPTER_UNAVAILABLE`, `DELIVERY_UNCONFIRMED`, `INTERNAL_ERROR`。例外/SQL/接続情報は返さない。満席は自動再試行せず利用者が再操作。

## 4. Client状態と履歴同期

接続状態 `DISCONNECTED → CONNECTING → JOINING → JOINED`; join rejectは`FULL/DISABLED/ERROR`として表示。socket切断後は送信を止める。自動送信再試行なし。Socket.IO reconnect後は新connectionとしてjoin、seat取得、history再取得を必ず行う。

join historyはSQLで最新20件を `(created_at DESC,id DESC)` で取得し、wireでは古い順に返す。history sync中のbroadcastとhistory responseはID mapにmergeし、日時とnumeric BIGINT orderでsortし、最新20件にtrim。`afterId` query/limitが履歴gapを取りこぼさないよう、次段落の固定20件 snapshot syncも定期的に行う。

各joined socketは10秒間隔で `chat:history:sync` を要求する案を採用。これはPostgres Adapterの一時障害/通知欠落を最大おおむね10秒の追加読込周期で再照合するための、5-seatスコープで許容可能な負荷設計値。`afterId`だけだと途中のid順序・ID commit逆転を取りこぼす可能性があるため、syncは最新20 snapshotを取得する。周期は遅延/負荷測定で再評価する。DB障害時は失敗表示、次の通常周期で1回再確認（短時間の自動retry loopではない）。

## 5. PostgreSQL schema / transaction

### `chat_messages`

`id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `room_id TEXT NOT NULL CHECK (room_id='lobby')`, `username TEXT NOT NULL`, `comment TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. DB CHECKはtrim後のchar_lengthを確認し、TypeScript `Array.from(trimmed).length` と同じUnicode codepoint長になるPostgreSQL文字数関数をdisposable PostgreSQLで照合する。index候補は `(room_id,created_at DESC,id DESC)`。

### `chat_room_seats`

`room_id='lobby'`、`slot_no SMALLINT CHECK 1..5`の計5行をDDLで用意。各slotに nullable `connection_id UUID`, `socket_id TEXT`, `lease_token UUID`, `expires_at TIMESTAMPTZ`。`PRIMARY KEY(room_id,slot_no)`、active connection idのunique partial index。runtime roleにslot追加/削除権限を与えない方針を試験する。

### `socket_io_attachments`

Socket.IO Postgres Adapterが8KBを超える/binary event用にauxiliary payload tableを使うため、公式adapter optionのtableNameを専用 `chat_socket_io_attachments` にする。正確なDDLは採用package versionの公式例とsourceをレビューして`051`に固定し、adapter packageによる暗黙DDLに依存しない。Adapter接続poolと通常SQL用共有 `requirePool()` は分離。

### Seat lease/time rationale

- Lease TTL 30s、renew every 5s (requirements §3)。5s renewは1回程度のquery遅延を吸収し、30s TTLでabrupt process lossのstale occupancyを有限化する。lease recovery worst-case delay is up to TTL (plus next admission attempt); full condition is fail-safe.
- Renew uses DB clock, batch update by active connection UUID + fencing token. Renewal query count at five active clients is at most one per process every 5s if batch; never one timer/query per client.
- Fencing token is fresh random UUID for each new claim. Release/update requires room, slot, connection UUID and same token; stale completion cannot touch a later lease.

### Atomic admission / renewal

Each `chat:join` is serialized per socket in-process with `socket.data.joinPromise`, and DB is authoritative across processes. In one transaction:

1. Lock the room's five slot rows in deterministic `slot_no` order.
2. If same `connection_id` owns an unexpired lease, renew/return that exact slot/token (idempotent duplicate join).
3. Else take first free/expired slot using row lock; replace old owner/token with new UUID/token and DB-clock `expires_at=now()+30s`.
4. Count valid leases with `expires_at > DB now`; commit. If none is available, `ROOM_FULL`.

No separate counter is source of truth; fixed five rows make >5 impossible. If DB unavailable, deny.

### Join interruption / disconnect

After claim, handler checks `socket.connected` and token validity before calling `socket.join` and before sending history. If disconnect happens during asynchronous history read, a `disconnected` marker prevents room join/ack and `finally` runs conditional token release. A periodic local lease monitor checks only its instance's known sockets; renewal failure/expired token removes the socket from room and disconnects it. New broadcasts target only active socket IDs returned by shared DB checks, so stale memberships are not broadcast targets. Compensation is idempotent; TTL remains crash-recovery backstop.

### Message transaction and lease validity

Within one transaction, lock the exact seat row, check `connection_id`, socket ID, fencing token and `expires_at > clock_timestamp()`, renew lease, validate room ownership and insert message with `RETURNING`. Commit before any adapter emit. History read similarly locks/validates/renews seat and performs SELECT in the same transaction; no history for expired connection. Message lock holds a recipient snapshot transaction: include only slots with valid expiry and token. To avoid sending to stale memberships, route to returned Socket IDs, not `io.to('lobby')` wildcard.

Potential time elapsing between DB recipient snapshot and wire send is bounded by the operation; lease is renewed transactionally before the snapshot. Owner instance's 5s renewal/expiry monitor removes a socket that becomes stale. This design cannot revoke bytes already sent before expiry and does not claim that ability.

## 6. Seat state and lock/fencing details

State `FREE → CLAIMED(connection_id,token,expiry) → RENEWED → RELEASED/EXPIRED`. Concurrent cross-process claim transaction locks fixed rows. A serialization/lock timeout fails closed (`DB_UNAVAILABLE`), not local count fallback. Active leases count uses DB `clock_timestamp()`; tests use barriers for race ordering. Release with old token affects zero rows and is success/idempotent for caller but cannot free new owner.

Expiry causes that socket's next incoming event, history sync, or message to fail `NOT_JOINED`; passive receive is prevented by DB-selected target Socket IDs, plus local expiry monitor removes its room membership. Process crash releases nothing; other process can reclaim expired row only after 30s. A reconnect during this interval may see temporary full; UI says retry manually.

## 7. Postgres Adapter, delivery semantics and outage recovery

Postgres Adapter handles inter-instance Socket.IO broadcast, but not global seats, persisted chat history, or client receipt acknowledgments. It uses PostgreSQL LISTEN/NOTIFY. Adapter uses a dedicated `pg.Pool` with a **direct/session-capable connection string**; never feed it the normal Neon PgBouncer transaction pool. Message/seat SQL uses existing shared `requirePool()` configured to pooled endpoint for short transactions. Adapter attachment table gets a dedicated name/DDL.

**No local-only fallback.** Adapter health is a readiness state shared by all per-socket handlers in that process. Adapter listener/pool errors, server heartbeat health check failures, or Postgres adapter `serverSideEmit`/`serverCount` health-check timeout mark delivery unavailable. During degraded state:

1. keep joins, history, and writes fail-closed if shared DB/adapter state cannot establish authoritative admission;
2. if INSERT committed before adapter went unavailable, retain the saved row and return `delivery:'unconfirmed'` / `DELIVERY_UNCONFIRMED`; never imply every participant received it;
3. do not emit only to sender's local instance;
4. notify connected local clients of degraded mode if their socket still works;
5. each client continues scheduled latest-20 history reconciliation or performs it after reconnect; missing rows are merged by ID. This recovers data visibility, not the original instant broadcast.

Socket.IO Postgres adapter has server-side broadcasts with acknowledgements but not connection-state recovery. An adapter publish call completing does not prove every browser rendered an event. If adapter emits fail silently without exposing errors, rely on server-side health probes plus history reconciliation and report delivery status conservatively. If reliable durable fanout becomes mandatory beyond periodic reconciliation, implement transactional outbox + managed durable worker as a separate architecture decision; do not pretend DB insert + NOTIFY is atomic. Adapter uses LISTEN/NOTIFY and supports an auxiliary attachments table for payloads >8KB/binary.[Adapter docs](https://socket.io/docs/v4/postgres-adapter/)

## 8. Multiple-instance and Vercel deployment

- Vercel requires Socket.IO WebSocket transport (not Engine.IO polling fallback) and Function URL path alignment; WebSocket-only avoids sticky-session requirement for polling sessions. Multi-instance Adapter and DB seats remain required.
- Connection is pinned to accepting Function instance and closed at max duration; clients reconnect with Socket.IO backoff, rejoin, reclaim a seat, and reload history. Each reconnect may land elsewhere.
- Function max-duration figures vary by plan/Fluid Compute/config, and deployment has not been inspected. The published default/max figures are not this app's effective timeout. Preview verification must record project setting, Function path, actual close behavior.
- Local tests: one process proves component behavior; two independent processes plus disposable Postgres and adapter prove cross-process fanout/atomic seat race. These do not prove Vercel Function routing, websocket upgrade through CDN, function recycle/reconnect or Neon connection limits.
- Neon: pooled endpoint is PgBouncer transaction-mode and explicitly does not support `LISTEN/NOTIFY`; direct endpoint session features are necessary for adapter. Each active Node instance may hold its own adapter listener pool plus `src/db.ts` app Pool (`max:2` per process). Capacity estimate is at most approx `2N + L*N` DB clients for N active instances and L adapter sessions each, not a global max. Direct connection quotas/scale and Function reuse must be checked. [Neon pooling docs](https://neon.com/docs/connect/connection-pooling)
- New Vercel connection may go to another instance; room state/count stays in DB. Adapter/seat initialization failures keep chat disabled, while existing static page and other application routes remain available.

## 9. Sequence

```mermaid
sequenceDiagram
  participant C as Browser
  participant F as Socket.IO instance
  participant D as Shared PostgreSQL
  participant A as Postgres Adapter
  C->>F: connect WebSocket; chat:join(username)
  F->>D: transaction lock 5 slots; idempotent claim/renew
  alt full / guard disabled / DB error
    F-->>C: safe ack error; no history, no room membership
  else claim succeeded
    F->>D: same seat validated; history SELECT newest 20; commit
    F->>F: verify still connected, join internal room
    F-->>C: join ack + chronological history
    C->>F: chat:message:send(comment)
    F->>D: transaction lock+validate lease; INSERT RETURNING; commit
    F->>D: select currently valid recipient Socket IDs
    F->>A: broadcast to recipient IDs (no local fallback)
    A-->>C: chat:message:new (delivery best-effort)
    F-->>C: ack saved + delivery state
  end
  loop every 10 seconds / after reconnect
    C->>F: chat:history:sync
    F->>D: transaction validate+renew lease; SELECT latest 20
    D-->>C: snapshot; client merge by decimal-string id
  end
  C-->>F: disconnect
  F->>D: conditional release using exact fencing token
```

## 10. Error & security model

Fail closed on disabled flag/environment, adapter unavailable, seat DB uncertainty, history DB failure. No public chat default. Proposed env: `CHAT_DEMO_ENABLED=true` **only** when `NODE_ENV=development` and `VERCEL_ENV` unset; any Preview/Production or unknown config denies. This is chat-only and does not modify AI V1/V2 guards. EJS HTML is static trusted content; user content is text nodes only. No credentials/messages in logs. Validation occurs server side regardless of client checks. Rate limiting/user moderation are open future ops items, but payload limits and fixed max seats apply now.

## 11. Unverified and unresolved deployment facts

Neon direct endpoint availability/connection quota for this adapter, Vercel routing entry and session lifetime, Vercel maxDuration and Preview protection, adapter fail/health signals supported by the chosen package version, outage simulation fidelity, triggerless history sync load, official WISH source and post retention policy are not established by local documentation. No Vercel or Neon settings are changed here. Deployed chat remains disabled until dedicated protected Preview test and explicit approval.
