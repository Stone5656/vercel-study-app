# TODO アプリ V2 要件定義

## 目的と V1 からの変更

V1 の TODO 機能をそのまま維持し、優先度と絞り込みを備えた V2 を独立して追加する。V1 の要件 ID・API・画面・`todo_tasks` の schema/data は変更しない。V2 は `/todo-v2`、`/api/v2/todos`、`v2_todo_tasks` を使用する。V1 の TODO を V2 へ移行しない。

## 優先度

- `priority` は `low` / `normal` / `high`。
- POST で省略した場合は `normal`。
- DB と API response に保存・出力する。
- PATCH で変更できる。
- 許可値以外は 422 `VALIDATION_ERROR`。

## 絞り込み

- `completed` は query string の文字列 `true` / `false` のみを許可する。不正値は400。
- `priority` は `low` / `normal` / `high` のみを許可する。不正値は422。
- 条件なしは全件、片方のみならその条件、両方なら AND 条件で絞り込む。
- 0件は200と空配列。順序は ID 昇順。

## V2 API 操作

| ID        | 操作                       | 入力                               | 成功                                  | 受け入れ条件                                              |
| --------- | -------------------------- | ---------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| V2-REQ-01 | `GET /api/v2/todos`        | 任意の `completed`, `priority`     | 200 `{status:'success',data: Todo[]}` | 条件を安全に組み合わせ、ID昇順で返す。条件なし・0件を扱う |
| V2-REQ-02 | `POST /api/v2/todos`       | title と任意 priority              | 201 `{status:'success',data: Todo}`   | trim 後の title 1～100文字、priority 省略時 normal        |
| V2-REQ-03 | `PATCH /api/v2/todos/:id`  | `isCompleted` と/または `priority` | 200 `{status:'success',data: Todo}`   | 少なくとも一方を変更し、両方同時も可                      |
| V2-REQ-04 | `DELETE /api/v2/todos/:id` | 1以上の整数 ID                     | 204、本文なし                         | 該当する V2 行のみ削除                                    |

## 入力・エラー制約

- title は前後の空白を除去して1～100文字。欠落/型違いは400、空白のみ/長さ超過は422。
- ID は1以上の整数。形式不正は400。
- `completed` は `true` または `false` のみ。型・形式不正は400。
- `priority` は `low` / `normal` / `high`。許可外の値は422、型違いは400。
- PATCH の空オブジェクト、または変更可能キーがない body は400。
- エラー JSON は V1 と同じ `{status:'error',code,message,details:[]}`。
- 400 `BAD_REQUEST`、422 `VALIDATION_ERROR`、404 `NOT_FOUND`、500 `INTERNAL_ERROR`、503 `DB_UNAVAILABLE`。
- SQL / 内部エラー詳細は API に含めない。

## 画面・互換性・環境確認

`/todo-v2` はタイトル、優先度、完了状態、優先度フィルター、完了フィルター、リセット、処理中/エラー/0件表示を備える。登録・更新・削除後に一覧を再取得する。ユーザー文字列は安全な DOM API で描画する。

V1 の `todo_tasks` と V2 の `v2_todo_tasks` は完全に別のデータ領域とする。V1 routes/DTO を変更せず、V1 回帰テストを行う。

Local は DB API と CRUD、Preview は認証可能なブラウザで V1/V2 の画面・CRUD・絞り込み・既存 routes、Production は承認済みマージ後に同じ項目を確認する。Vercel environment の `DATABASE_URL` は両環境が同じ Neon database を参照する授業設定であることを値を開示せず確認する。
