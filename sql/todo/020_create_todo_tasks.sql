CREATE TABLE IF NOT EXISTS todo_tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
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
  AND table_name = 'todo_tasks'
ORDER BY ordinal_position;

-- 既存の行は削除せず、初期件数だけを確認する
SELECT COUNT(*) AS existing_todo_count
FROM public.todo_tasks;
