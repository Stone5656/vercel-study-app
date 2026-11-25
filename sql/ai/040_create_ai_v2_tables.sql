-- AI Conversation V2 schema. This script is intentionally non-destructive.
-- Review the catalog output before applying to any persistent database.

BEGIN;

-- Preflight: columns, constraints, defaults, and index definitions.
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_identity,
  identity_generation
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ai_v2_conversations', 'ai_v2_turns')
ORDER BY table_name, ordinal_position;

SELECT
  table_class.relname AS table_name,
  constraint_data.conname,
  constraint_data.contype,
  pg_get_constraintdef(constraint_data.oid, true) AS definition
FROM pg_constraint AS constraint_data
JOIN pg_class AS table_class
  ON table_class.oid = constraint_data.conrelid
JOIN pg_namespace AS table_schema
  ON table_schema.oid = table_class.relnamespace
WHERE table_schema.nspname = 'public'
  AND table_class.relname IN ('ai_v2_conversations', 'ai_v2_turns')
ORDER BY table_class.relname, constraint_data.conname;

SELECT
  table_class.relname AS table_name,
  index_class.relname AS index_name,
  pg_get_indexdef(index_data.indexrelid) AS definition,
  index_data.indkey::text AS key_attribute_numbers,
  index_data.indoption::text AS key_options,
  index_data.indnkeyatts,
  index_data.indnatts,
  index_data.indisunique,
  index_data.indisvalid,
  index_data.indisready,
  index_data.indpred IS NOT NULL AS is_partial
FROM pg_index AS index_data
JOIN pg_class AS table_class
  ON table_class.oid = index_data.indrelid
JOIN pg_namespace AS table_schema
  ON table_schema.oid = table_class.relnamespace
JOIN pg_class AS index_class
  ON index_class.oid = index_data.indexrelid
WHERE table_schema.nspname = 'public'
  AND table_class.relname IN ('ai_v2_conversations', 'ai_v2_turns')
ORDER BY table_class.relname, index_class.relname;

SELECT
  table_class.relname AS table_name,
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
  AND table_class.relname IN ('ai_v2_conversations', 'ai_v2_turns')
ORDER BY table_class.relname, column_class.attname;

CREATE TABLE IF NOT EXISTS public.ai_v2_conversations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_v2_conversations_title_length_check
    CHECK (char_length(title) >= 1 AND char_length(title) <= 50),
  CONSTRAINT ai_v2_conversations_title_not_blank_check
    CHECK (title ~ '[^[:space:]]')
);

CREATE TABLE IF NOT EXISTS public.ai_v2_turns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_v2_turns_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES public.ai_v2_conversations (id)
    ON DELETE RESTRICT,
  CONSTRAINT ai_v2_turns_prompt_length_check
    CHECK (char_length(prompt) >= 1 AND char_length(prompt) <= 2000),
  CONSTRAINT ai_v2_turns_prompt_not_blank_check
    CHECK (prompt ~ '[^[:space:]]'),
  CONSTRAINT ai_v2_turns_response_not_blank_check
    CHECK (response_text ~ '[^[:space:]]')
);

-- Stop before creating indexes when an existing relation has a different shape.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_v2_conversations'
  ) <> 4 OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_conversations'
      AND column_name = 'id' AND data_type = 'integer'
      AND is_nullable = 'NO' AND is_identity = 'YES'
      AND identity_generation = 'ALWAYS'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_conversations'
      AND column_name = 'title' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_conversations'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'
      AND column_default = 'CURRENT_TIMESTAMP'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_conversations'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'
      AND column_default = 'CURRENT_TIMESTAMP'
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
  ) <> 5 OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
      AND column_name = 'id' AND data_type = 'integer'
      AND is_nullable = 'NO' AND is_identity = 'YES'
      AND identity_generation = 'ALWAYS'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
      AND column_name = 'conversation_id'
      AND data_type = 'integer' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
      AND column_name = 'prompt' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
      AND column_name = 'response_text'
      AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_v2_turns'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'
      AND column_default = 'CURRENT_TIMESTAMP'
  ) THEN
    RAISE EXCEPTION 'AI V2 column definition does not match the expected schema';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class
      ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_conversations'
      AND constraint_data.contype = 'p'
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_data.conkey) WITH ORDINALITY AS keys(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_data.conrelid
         AND attribute.attnum = keys.attnum
        ORDER BY keys.position
      ) = ARRAY['id']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_conversations'
      AND constraint_data.conname = 'ai_v2_conversations_title_length_check'
      AND constraint_data.contype = 'c'
      AND regexp_replace(lower(pg_get_constraintdef(constraint_data.oid, true)),
        '[[:space:]()]|::text', '', 'g')
        = 'checkchar_lengthtitle>=1andchar_lengthtitle<=50'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_conversations'
      AND constraint_data.conname = 'ai_v2_conversations_title_not_blank_check'
      AND constraint_data.contype = 'c'
      AND regexp_replace(lower(pg_get_constraintdef(constraint_data.oid, true)),
        '[[:space:]()]|::text', '', 'g')
        = 'checktitle~''[^[:space:]]'''
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND constraint_data.contype = 'p'
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_data.conkey) WITH ORDINALITY AS keys(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_data.conrelid
         AND attribute.attnum = keys.attnum
        ORDER BY keys.position
      ) = ARRAY['id']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND constraint_data.conname = 'ai_v2_turns_conversation_id_fkey'
      AND constraint_data.contype = 'f'
      AND constraint_data.confrelid = 'public.ai_v2_conversations'::regclass
      AND constraint_data.confdeltype = 'r'
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_data.conkey) WITH ORDINALITY AS keys(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_data.conrelid
         AND attribute.attnum = keys.attnum
        ORDER BY keys.position
      ) = ARRAY['conversation_id']::text[]
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_data.confkey) WITH ORDINALITY AS keys(attnum, position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_data.confrelid
         AND attribute.attnum = keys.attnum
        ORDER BY keys.position
      ) = ARRAY['id']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND constraint_data.conname = 'ai_v2_turns_prompt_length_check'
      AND constraint_data.contype = 'c'
      AND regexp_replace(lower(pg_get_constraintdef(constraint_data.oid, true)),
        '[[:space:]()]|::text', '', 'g')
        = 'checkchar_lengthprompt>=1andchar_lengthprompt<=2000'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND constraint_data.conname = 'ai_v2_turns_prompt_not_blank_check'
      AND constraint_data.contype = 'c'
      AND regexp_replace(lower(pg_get_constraintdef(constraint_data.oid, true)),
        '[[:space:]()]|::text', '', 'g')
        = 'checkprompt~''[^[:space:]]'''
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_data
    JOIN pg_class AS table_class ON table_class.oid = constraint_data.conrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND constraint_data.conname = 'ai_v2_turns_response_not_blank_check'
      AND constraint_data.contype = 'c'
      AND regexp_replace(lower(pg_get_constraintdef(constraint_data.oid, true)),
        '[[:space:]()]|::text', '', 'g')
        = 'checkresponse_text~''[^[:space:]]'''
  ) THEN
    RAISE EXCEPTION 'AI V2 constraint definition does not match the expected schema';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ai_v2_conversations_updated_at_id_idx
  ON public.ai_v2_conversations (updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ai_v2_turns_conversation_created_at_id_idx
  ON public.ai_v2_turns (conversation_id ASC, created_at DESC, id DESC);

-- IF NOT EXISTS skips same-name indexes without comparing them; verify exact keys.
DO $$
DECLARE
  conversation_keys TEXT;
  turn_keys TEXT;
BEGIN
  SELECT format('%s %s', updated_at.attnum, id_column.attnum)
  INTO conversation_keys
  FROM pg_class AS table_class
  JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
  JOIN pg_attribute AS updated_at ON updated_at.attrelid = table_class.oid
    AND updated_at.attname = 'updated_at'
  JOIN pg_attribute AS id_column ON id_column.attrelid = table_class.oid
    AND id_column.attname = 'id'
  WHERE table_schema.nspname = 'public' AND table_class.relname = 'ai_v2_conversations';

  SELECT format('%s %s %s', conversation_id.attnum, created_at.attnum, id_column.attnum)
  INTO turn_keys
  FROM pg_class AS table_class
  JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
  JOIN pg_attribute AS conversation_id ON conversation_id.attrelid = table_class.oid
    AND conversation_id.attname = 'conversation_id'
  JOIN pg_attribute AS created_at ON created_at.attrelid = table_class.oid
    AND created_at.attname = 'created_at'
  JOIN pg_attribute AS id_column ON id_column.attrelid = table_class.oid
    AND id_column.attname = 'id'
  WHERE table_schema.nspname = 'public' AND table_class.relname = 'ai_v2_turns';

  IF NOT EXISTS (
    SELECT 1 FROM pg_index AS index_data
    JOIN pg_class AS table_class ON table_class.oid = index_data.indrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_conversations'
      AND index_class.relname = 'ai_v2_conversations_updated_at_id_idx'
      AND index_data.indkey::text = conversation_keys
      AND index_data.indoption::text = '3 3'
      AND index_data.indnkeyatts = 2 AND index_data.indnatts = 2
      AND NOT index_data.indisunique AND index_data.indisvalid AND index_data.indisready
      AND index_data.indpred IS NULL
      AND regexp_replace(lower(pg_get_indexdef(index_data.indexrelid)), '[[:space:]]', '', 'g')
        = 'createindexai_v2_conversations_updated_at_id_idxonpublic.ai_v2_conversationsusingbtree(updated_atdesc,iddesc)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index AS index_data
    JOIN pg_class AS table_class ON table_class.oid = index_data.indrelid
    JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
    JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = 'ai_v2_turns'
      AND index_class.relname = 'ai_v2_turns_conversation_created_at_id_idx'
      AND index_data.indkey::text = turn_keys
      AND index_data.indoption::text = '0 3 3'
      AND index_data.indnkeyatts = 3 AND index_data.indnatts = 3
      AND NOT index_data.indisunique AND index_data.indisvalid AND index_data.indisready
      AND index_data.indpred IS NULL
      AND regexp_replace(lower(pg_get_indexdef(index_data.indexrelid)), '[[:space:]]', '', 'g')
        = 'createindexai_v2_turns_conversation_created_at_id_idxonpublic.ai_v2_turnsusingbtree(conversation_id,created_atdesc,iddesc)'
  ) THEN
    RAISE EXCEPTION 'AI V2 index definition does not match the expected schema';
  END IF;
END
$$;

COMMIT;
