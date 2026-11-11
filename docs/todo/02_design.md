# TODO アプリ V1 設計書

## 参照要件

- REQ-01: [TODO一覧](01_requirements.md#req-01-todo一覧)
- REQ-02: [TODO登録](01_requirements.md#req-02-todo登録)
- REQ-03: [完了状態の部分更新](01_requirements.md#req-03-完了状態の部分更新)
- REQ-04: [TODO削除](01_requirements.md#req-04-todo削除)

要件 ID と意味は要件定義書から変更せずに参照する。

## 1. 全体アーキテクチャ

Browser (EJS + `TodoApi`) → Express Router → Controller (HTTP・入力検証) → Model (SQL) → 共有 PostgreSQL Pool (`src/db.ts`) → Neon PostgreSQL。JSON API の成功・エラー形式を Controller で統一する。

## 2–3. ディレクトリ構成と責務

```text
src/apps/todo/
  todoRouter.ts       # API と画面ルートの登録
  todoController.ts   # HTTP 入出力、バリデーション、ステータス/JSON
  todoModel.ts        # パラメータ化 SQL、行と API DTO の変換
views/todo/index.ejs  # TODO 画面の構造
public/todo/todo.js  # TodoApi と画面操作
sql/todo/020_create_todo_tasks.sql
```

- `src/app.ts`: `express.json()`、既存 middleware と TODO Router の登録のみ。
- `src/db.ts`: 既存 Pool を再利用。
- `tests/server/todo.test.ts`: Router を依存注入し、DB 非依存の自動テストを実行。

## 4. リクエスト処理

画面 GET `/todo` は EJS を返す。画面 JavaScript は `TodoApi` を通じて API を呼び、成功後に一覧を再取得する。API Router は Controller に委譲し、Controller が検証後 Model を呼ぶ。Model は SQL placeholder と `RETURNING` を使い、DB row を API DTO に変換する。エラーは Controller で共通形式へ変換する。

## 5. DB スキーマ

`todo_tasks(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT NOT NULL, is_completed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`。タイトルは前後空白を除いた1～100文字。CHECK 制約で空文字と100文字超過を拒否する。既存テーブルを削除・変更しない。

## 6–8. REST API、HTTP、JSON

| 要件   | 操作                       | SQL                       | 成功                                  |
| ------ | -------------------------- | ------------------------- | ------------------------------------- |
| REQ-01 | `GET /api/v1/todos`        | `SELECT ... ORDER BY id`  | 200 `{status:'success',data: Todo[]}` |
| REQ-02 | `POST /api/v1/todos`       | `INSERT ... RETURNING`    | 201 `{status:'success',data: Todo}`   |
| REQ-03 | `PATCH /api/v1/todos/:id`  | `UPDATE ... RETURNING`    | 200 `{status:'success',data: Todo}`   |
| REQ-04 | `DELETE /api/v1/todos/:id` | `DELETE ... RETURNING id` | 204、本文なし                         |

Todo DTO: `{ id:number, title:string, isCompleted:boolean, createdAt:string }`。

エラー: 400 `BAD_REQUEST`（JSON不正、必須値/型、ID）、422 `VALIDATION_ERROR`（trim後空/101文字以上）、404 `NOT_FOUND`、500 `INTERNAL_ERROR`、503 `DB_UNAVAILABLE`。全エラーは `{status:'error',code,message,details:[]}`。詳細な SQL/内部エラーは返さない。

## 9. ブラウザ側 TodoApi

`list()` は GET、`create(title)` は JSON POST、`update(id,isCompleted)` は JSON PATCH、`delete(id)` は DELETE。各メソッドは URL を組み立て、`response.ok` を検査し、エラー JSON の message を含むエラーを投げる。DELETE 204 は本文を解析しない。イベント処理は API URL を直接組み立てない。

画面は `textContent` でユーザー由来のタイトルを挿入し、処理中表示とエラー表示を持つ。登録・更新・削除後は一覧を再取得し、0件時は「TODOがありません」を表示する。

## 10. エラー処理

Controller は入力エラーを SQL 実行前に返す。DB 接続不能は 503、予期しない例外は汎用 500。Express JSON parser の `SyntaxError` かつ status 400 を JSON エラー middleware で捕捉する。クライアントへ内部詳細を出さない。

## 11. テスト方法・対応表

| API / 要件      | DB処理                               | TodoApi                  | 自動テスト                   |
| --------------- | ------------------------------------ | ------------------------ | ---------------------------- |
| GET / REQ-01    | `listTodos` SELECT                   | `list()`                 | 空一覧、順序、DB障害         |
| POST / REQ-02   | `createTodo` INSERT RETURNING        | `create(title)`          | 201、欠落、型、空白、101文字 |
| PATCH / REQ-03  | `setTodoCompletion` UPDATE RETURNING | `update(id,isCompleted)` | 200、ID不正、不存在、型      |
| DELETE / REQ-04 | `deleteTodo` DELETE RETURNING        | `delete(id)`             | 204本文なし、ID不正、不存在  |
| 共通            | —                                    | —                        | 不正JSON、既存3ルートの回帰  |

Controller Router を fake Model に差し替えて DB 非依存テストを行う。Neon を用いる実 DB の統合確認はローカル・Preview・Production で別に実施する。
