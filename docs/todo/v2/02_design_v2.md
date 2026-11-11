# TODO アプリ V2 設計書

## V1 との互換性と責務の共有

V1 の要件 ID・ルート・Controller/Model/画面・`todo_tasks` は変更しない。Express JSON parser、静的配信、既存 PostgreSQL Pool を再利用する。V2 の Router、Controller、Model、画面、ブラウザ API client、DTO は独立させる。これにより共通化目的の V1 大規模変更やデータ混入を防ぐ。

## ディレクトリ

```text
src/apps/todo/v2/
  todoRouterV2.ts
  todoControllerV2.ts
  todoModelV2.ts
public/todo/todo-v2.js
public/todo/todo-v2.d.ts
views/todo/v2.ejs
sql/todo/021_create_todo_tasks_v2.sql
```

`src/app.ts` は V2 Router の登録のみ追加する。DB access は `src/db.ts` の共有 Pool。

## アーキテクチャ

Browser `TodoApiV2` → V2 Router → V2 Controller（検証/HTTP）→ V2 Model（parameterized SQL/DTO mapping）→ shared Pool → Neon `v2_todo_tasks`。

## DB

`v2_todo_tasks`: `id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; `title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100 AND char_length(btrim(title)) > 0)`; `is_completed BOOLEAN NOT NULL DEFAULT FALSE`; `priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high'))`; `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`。

V1 table は変更せず、V1 data migration も行わない。

## API・HTTP・JSON

| 操作                       | SQL                                                                  | 成功                                  |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| GET `/api/v2/todos`        | optional AND predicates with `$n`, `ORDER BY id`                     | 200 `{status:'success',data: Todo[]}` |
| POST `/api/v2/todos`       | INSERT bound title/priority `RETURNING`                              | 201 `{status:'success',data: Todo}`   |
| PATCH `/api/v2/todos/:id`  | dynamically build allowed SET columns with bound values, `RETURNING` | 200 `{status:'success',data: Todo}`   |
| DELETE `/api/v2/todos/:id` | DELETE `RETURNING id`                                                | 204 empty body                        |

Todo DTO: `{id:number,title:string,isCompleted:boolean,priority:'low'|'normal'|'high',createdAt:string}`. DB `is_completed`, `created_at` map to camelCase and ISO timestamp.

Error response matches V1: `{status:'error',code,message,details:[]}`. 400 `BAD_REQUEST`; 422 `VALIDATION_ERROR`; 404 `NOT_FOUND`; 500 `INTERNAL_ERROR`; 503 `DB_UNAVAILABLE`.

## Query / validation

`completed` query is parsed only from exact strings `true` / `false`. `priority` must be one of three values. SQL conditions and values arrays are built separately, so user values never form SQL syntax. POST trims title and defaults priority to `normal`. PATCH accepts only `isCompleted` and/or `priority`; unknown keys or empty body are rejected. ID parsing follows V1's positive safe integer rule.

## TodoApiV2

- `list(filters={})`: build query string with `URLSearchParams`, GET and decode success/error JSON.
- `create(title, priority='normal')`: JSON POST.
- `update(id, changes)`: JSON PATCH.
- `delete(id)`: DELETE, do not parse 204 body.

Class owns URL construction and response error handling. UI handlers call its methods only.

## 画面

`GET /todo-v2` renders V2 template. V2 script renders with `textContent`, creates priority select, completion checkbox and delete button per row. Filters call `list({completed,priority})`; reset clears filters. Mutations reload current filters. Loading/error/empty states are explicit.

## テスト

- V2 Router uses injected fake model for empty/filtered GET, create defaults and all priorities, PATCH combinations, DELETE 204, all validation/error cases, malformed JSON and DB unavailable.
- TodoApiV2 mocks Fetch to verify URLs/query/method/body/error/204.
- App regression checks existing V1 routes and static page; assert V1 and V2 models target separate tables.
- Local E2E performs V1/V2 operations using unique records and removes only those records. Preview and Production use environment-specific browser/API checks.
