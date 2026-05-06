-- Trigram indexes for fast ILIKE business search
CREATE INDEX IF NOT EXISTS businesses_name_trgm_idx
  ON businesses USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS businesses_address_trgm_idx
  ON businesses USING GIN ((COALESCE(number, '') || ' ' || COALESCE(street, '')) gin_trgm_ops);
