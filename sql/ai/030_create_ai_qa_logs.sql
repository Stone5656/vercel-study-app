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

-- 既存定義確認SQL: constraints / primary key columns
SELECT
  c.conname,
  c.contype,
  pg_get_constraintdef(c.oid, true) AS definition,
  CASE
    WHEN c.contype = 'p' THEN ARRAY(
      SELECT a.attname::text
      FROM unnest(c.conkey) WITH ORDINALITY AS key_columns(attnum, position)
      JOIN pg_attribute AS a
        ON a.attrelid = c.conrelid
       AND a.attnum = key_columns.attnum
      ORDER BY key_columns.position
    )
  END AS primary_key_columns
FROM pg_constraint AS c
JOIN pg_class AS table_class
  ON table_class.oid = c.conrelid
JOIN pg_namespace AS table_schema
  ON table_schema.oid = table_class.relnamespace
WHERE table_schema.nspname = 'public'
  AND table_class.relname = 'ai_qa_logs'
ORDER BY c.conname;

-- 既存定義確認SQL: indexes
SELECT
  index_class.relname AS index_name,
  pg_get_indexdef(index_data.indexrelid) AS index_definition,
  index_data.indkey::text AS key_attribute_numbers,
  index_data.indoption::text AS key_options,
  index_data.indnkeyatts AS key_column_count,
  index_data.indnatts AS total_column_count,
  index_data.indisunique AS is_unique,
  index_data.indisvalid AS is_valid,
  index_data.indisready AS is_ready,
  index_data.indpred IS NOT NULL AS is_partial
FROM pg_index AS index_data
JOIN pg_class AS table_class
  ON table_class.oid = index_data.indrelid
JOIN pg_namespace AS table_schema
  ON table_schema.oid = table_class.relnamespace
JOIN pg_class AS index_class
  ON index_class.oid = index_data.indexrelid
WHERE table_schema.nspname = 'public'
  AND table_class.relname = 'ai_qa_logs'
ORDER BY index_class.relname;

-- 既存定義確認SQL: created_at default expression
SELECT
  column_class.attname AS column_name,
  pg_get_expr(default_data.adbin, default_data.adrelid, true) AS default_expression
FROM pg_attrdef AS default_data
JOIN pg_class AS table_class
  ON table_class.oid = default_data.adrelid
JOIN pg_namespace AS table_schema
  ON table_schema.oid = table_class.relnamespace
JOIN pg_attribute AS column_class
  ON column_class.attrelid = default_data.adrelid
 AND column_class.attnum = default_data.adnum
WHERE table_schema.nspname = 'public'
  AND table_class.relname = 'ai_qa_logs'
  AND column_class.attname = 'created_at';

CREATE TABLE IF NOT EXISTS public.ai_qa_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prompt TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_qa_logs_prompt_length_check
    CHECK (char_length(prompt) >= 1 AND char_length(prompt) <= 2000),
  CONSTRAINT ai_qa_logs_prompt_not_blank_check
    CHECK (prompt ~ '[^[:space:]]'),
  CONSTRAINT ai_qa_logs_response_not_blank_check
    CHECK (response_text ~ '[^[:space:]]')
);

-- 既存テーブルの列・制約・defaultが期待定義と異なる場合は停止します。
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
      AND column_default = 'CURRENT_TIMESTAMP'
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
    FROM pg_constraint AS c
    JOIN pg_class AS table_class
      ON table_class.oid = c.conrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND c.contype = 'p'
      AND ARRAY(
        SELECT a.attname::text
        FROM unnest(c.conkey) WITH ORDINALITY AS key_columns(attnum, position)
        JOIN pg_attribute AS a
          ON a.attrelid = c.conrelid
         AND a.attnum = key_columns.attnum
        ORDER BY key_columns.position
      ) = ARRAY['id']::text[]
      AND regexp_replace(
        lower(pg_get_constraintdef(c.oid, true)),
        '[[:space:]()]',
        '',
        'g'
      ) = 'primarykeyid'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS table_class
      ON table_class.oid = c.conrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND c.conname = 'ai_qa_logs_prompt_length_check'
      AND c.contype = 'c'
      AND regexp_replace(
        lower(pg_get_constraintdef(c.oid, true)),
        '[[:space:]()]|::text',
        '',
        'g'
      ) = 'checkchar_lengthprompt>=1andchar_lengthprompt<=2000'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS table_class
      ON table_class.oid = c.conrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND c.conname = 'ai_qa_logs_prompt_not_blank_check'
      AND c.contype = 'c'
      AND regexp_replace(
        lower(pg_get_constraintdef(c.oid, true)),
        '[[:space:]()]|::text',
        '',
        'g'
      ) = 'checkprompt~''[^[:space:]]'''
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS table_class
      ON table_class.oid = c.conrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND c.conname = 'ai_qa_logs_response_not_blank_check'
      AND c.contype = 'c'
      AND regexp_replace(
        lower(pg_get_constraintdef(c.oid, true)),
        '[[:space:]()]|::text',
        '',
        'g'
      ) = 'checkresponse_text~''[^[:space:]]'''
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attrdef AS default_data
    JOIN pg_class AS table_class
      ON table_class.oid = default_data.adrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    JOIN pg_attribute AS column_class
      ON column_class.attrelid = default_data.adrelid
     AND column_class.attnum = default_data.adnum
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND column_class.attname = 'created_at'
      AND pg_get_expr(default_data.adbin, default_data.adrelid, true) = 'CURRENT_TIMESTAMP'
  ) THEN
    RAISE EXCEPTION 'public.ai_qa_logs constraint or default definition does not match the expected schema';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ai_qa_logs_created_at_id_idx
  ON public.ai_qa_logs (created_at DESC, id DESC);

-- IF NOT EXISTSは同名indexの定義を比較しないため、作成後にcatalogを照合します。
DO $$
DECLARE
  expected_key_attributes TEXT;
BEGIN
  SELECT format('%s %s', created_at.attnum, id_column.attnum)
  INTO expected_key_attributes
  FROM pg_class AS table_class
  JOIN pg_namespace AS table_schema
    ON table_schema.oid = table_class.relnamespace
  JOIN pg_attribute AS created_at
    ON created_at.attrelid = table_class.oid
   AND created_at.attname = 'created_at'
  JOIN pg_attribute AS id_column
    ON id_column.attrelid = table_class.oid
   AND id_column.attname = 'id'
  WHERE table_schema.nspname = 'public'
    AND table_class.relname = 'ai_qa_logs';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_data
    JOIN pg_class AS table_class
      ON table_class.oid = index_data.indrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    JOIN pg_class AS index_class
      ON index_class.oid = index_data.indexrelid
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_qa_logs'
      AND index_class.relname = 'ai_qa_logs_created_at_id_idx'
      AND index_data.indkey::text = expected_key_attributes
      -- DESCはNULLS FIRSTが既定なのでDESC(1) + NULLS FIRST(2) = 3。
      AND index_data.indoption::text = '3 3'
      AND index_data.indnkeyatts = 2
      AND index_data.indnatts = 2
      AND index_data.indisunique = false
      AND index_data.indisvalid
      AND index_data.indisready
      AND index_data.indpred IS NULL
      AND regexp_replace(
        lower(pg_get_indexdef(index_data.indexrelid)),
        '[[:space:]]',
        '',
        'g'
      ) = 'createindexai_qa_logs_created_at_id_idxonpublic.ai_qa_logsusingbtree(created_atdesc,iddesc)'
  ) THEN
    RAISE EXCEPTION 'public.ai_qa_logs_created_at_id_idx definition does not match the expected schema';
  END IF;
END
$$;
