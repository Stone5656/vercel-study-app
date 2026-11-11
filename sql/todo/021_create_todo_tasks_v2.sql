CREATE TABLE IF NOT EXISTS v2_todo_tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 100
    AND char_length(btrim(title)) > 0
  ),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 既存テーブルがある場合も変更せず、実際の列定義を確認する
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'v2_todo_tasks'
ORDER BY ordinal_position;

-- 主キーと CHECK 制約を確認する
SELECT
  tc.constraint_type,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.check_constraints AS cc
  ON cc.constraint_catalog = tc.constraint_catalog
  AND cc.constraint_schema = tc.constraint_schema
  AND cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'v2_todo_tasks'
ORDER BY tc.constraint_type, tc.constraint_name;

-- 既存行は削除せず、内容を確認する
SELECT id, title, priority
FROM v2_todo_tasks
ORDER BY id;
