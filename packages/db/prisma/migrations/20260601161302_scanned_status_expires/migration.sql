-- AlterEnum
ALTER TYPE "CatalogStatus" ADD VALUE 'scanned';

-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CatalogProduct_status_expiresAt_idx" ON "CatalogProduct"("status", "expiresAt");

-- Re-assert the pg_trgm GIN index (managed via raw SQL, see 20260529214000_trgm_gin_index).
-- Prisma treats this index as drift and would otherwise drop it; keep it in place.
CREATE INDEX IF NOT EXISTS "CatalogProduct_nameNormalized_trgm_idx"
  ON "CatalogProduct" USING gin ("nameNormalized" gin_trgm_ops);
