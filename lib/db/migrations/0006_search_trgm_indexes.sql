-- Enable pg_trgm extension for fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index on concatenated house address for search
CREATE INDEX IF NOT EXISTS houses_address_trgm_idx
  ON houses USING GIN ((number || ' ' || street) gin_trgm_ops);

-- Index on household surname for search
CREATE INDEX IF NOT EXISTS households_surname_trgm_idx
  ON households USING GIN (surname gin_trgm_ops);
