-- Trigram GIN index to accelerate similarity() fuzzy search on normalized names.
CREATE INDEX IF NOT EXISTS "CatalogProduct_nameNormalized_trgm_idx"
  ON "CatalogProduct" USING gin ("nameNormalized" gin_trgm_ops);
