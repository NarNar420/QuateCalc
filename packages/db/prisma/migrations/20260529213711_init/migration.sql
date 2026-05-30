-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('north', 'haifa', 'center', 'jerusalem', 'south');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('piece', 'meter', 'square_meter', 'cubic_meter', 'kilogram', 'ton', 'liter', 'bag', 'roll', 'sheet', 'pack');

-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('staged', 'current', 'archived');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('confident', 'needs_review', 'no_match');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "packSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "region" "Region" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'staged',
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "scrapeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ScrapeRunStatus" NOT NULL DEFAULT 'failed',
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "nullPriceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "customerName" TEXT,
    "region" "Region" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "overhead" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rawText" TEXT,
    "rawUnit" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    "matchedProductId" TEXT,
    "matchStatus" "MatchStatus",
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchOverride" (
    "id" TEXT NOT NULL,
    "rawTextNormalized" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_key_key" ON "Supplier"("key");

-- CreateIndex
CREATE INDEX "CatalogProduct_supplierKey_region_status_idx" ON "CatalogProduct"("supplierKey", "region", "status");

-- CreateIndex
CREATE INDEX "CatalogProduct_nameNormalized_idx" ON "CatalogProduct"("nameNormalized");

-- CreateIndex
CREATE INDEX "ScrapeRun_supplierKey_startedAt_idx" ON "ScrapeRun"("supplierKey", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchOverride_rawTextNormalized_key" ON "MatchOverride"("rawTextNormalized");

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapeRun" ADD CONSTRAINT "ScrapeRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
