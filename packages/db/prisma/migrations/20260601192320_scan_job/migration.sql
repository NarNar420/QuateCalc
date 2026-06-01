-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('pending', 'scanning', 'matching', 'complete', 'failed');

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "lines" JSONB NOT NULL,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'pending',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanJob_status_createdAt_idx" ON "ScanJob"("status", "createdAt");

-- Re-assert the pg_trgm GIN index (managed via raw SQL, see 20260529214000_trgm_gin_index).
-- Prisma's diff treats this index as drift and emits a spurious DROP; it was removed here.
-- Keep the index in place idempotently.
CREATE INDEX IF NOT EXISTS "CatalogProduct_nameNormalized_trgm_idx"
  ON "CatalogProduct" USING gin ("nameNormalized" gin_trgm_ops);
