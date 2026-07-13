-- Trigram index for token search across the full household name
-- (surname + head-of-household + spouse). Supersedes the surname-only index.
CREATE INDEX IF NOT EXISTS households_name_trgm_idx
  ON households USING GIN ((COALESCE(surname, '') || ' ' || COALESCE(head_of_household_name, '') || ' ' || COALESCE(spouse_name, '')) gin_trgm_ops);

DROP INDEX IF EXISTS households_surname_trgm_idx;
