-- AI質問履歴テーブル作成SQL
--
-- 実行前に、下記の「既存定義確認SQL」だけを先に実行してください。
-- public.ai_qa_logs が既に存在し、期待定義と異なる場合は、DDLを実行せず
-- 差分を記録・報告してください。このファイルは既存定義を自動修正しません。

-- 既存定義確認SQL: columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_identity,
  identity_generation
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ai_qa_logs'
ORDER BY ordinal_position;

-- 既存定義確認SQL: constraints
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'ai_qa_logs'
ORDER BY constraint_name;

SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND constraint_name LIKE 'ai_qa_logs_%'
ORDER BY constraint_name;

-- 既存定義確認SQL: indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ai_qa_logs'
ORDER BY indexname;

CREATE TABLE IF NOT EXISTS public.ai_qa_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prompt TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_qa_logs_prompt_length_check
    CHECK (char_length(prompt) BETWEEN 1 AND 2000),
  CONSTRAINT ai_qa_logs_prompt_not_blank_check
    CHECK (prompt ~ '[^[:space:]]'),
  CONSTRAINT ai_qa_logs_response_not_blank_check
    CHECK (response_text ~ '[^[:space:]]')
);

-- 既存テーブルに期待する名前付き制約がない場合は停止し、indexを追加しません。
-- 同名テーブルの差異を自動補正しないための安全確認です。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND column_name = 'id'
      AND data_type = 'integer'
      AND is_nullable = 'NO'
      AND is_identity = 'YES'
      AND identity_generation = 'ALWAYS'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND column_name = 'prompt'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND column_name = 'response_text'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
      AND is_nullable = 'NO'
      AND column_default IS NOT NULL
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
  ) <> 4 THEN
    RAISE EXCEPTION 'public.ai_qa_logs column definition does not match the expected schema';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND constraint_type = 'PRIMARY KEY'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND constraint_name = 'ai_qa_logs_prompt_length_check'
      AND constraint_type = 'CHECK'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND constraint_name = 'ai_qa_logs_prompt_not_blank_check'
      AND constraint_type = 'CHECK'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'ai_qa_logs'
      AND constraint_name = 'ai_qa_logs_response_not_blank_check'
      AND constraint_type = 'CHECK'
  ) THEN
    RAISE EXCEPTION 'public.ai_qa_logs constraints do not match the expected schema';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ai_qa_logs_created_at_id_idx
  ON public.ai_qa_logs (created_at DESC, id DESC);
