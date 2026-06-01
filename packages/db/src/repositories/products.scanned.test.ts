import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../client.js";
import {
  insertScannedProducts,
  pruneExpiredScanned,
  searchCatalogByTrigram,
} from "./products.js";

const SK = "test-scan-fixedsuffix"; // stable, test-only supplier key

async function ensureSupplier() {
  return prisma.supplier.upsert({
    where: { key: SK },
    update: {},
    create: { key: SK, name: "scan test", baseUrl: "https://example.test" },
  });
}

afterAll(async () => {
  await prisma.catalogProduct.deleteMany({ where: { supplierKey: SK } });
  await prisma.supplier.deleteMany({ where: { key: SK } });
  await prisma.$disconnect();
});

describe("scanned products repo", () => {
  it("inserts scanned rows, finds them by trigram with statuses=['scanned'], and prunes expired", async () => {
    const supplier = await ensureSupplier();
    const future = new Date(Date.now() + 60_000);
    const inserted = await insertScannedProducts(
      [
        {
          supplierId: supplier.id,
          supplierKey: SK,
          sku: "T1",
          name: "מלט אפור לבדיקה",
          nameNormalized: "מלט אפור לבדיקה",
          unit: "bag",
          packSize: 1,
          price: 19.9,
          currency: "ILS",
          region: "center",
          url: "https://example.test/p/1",
          scrapedAt: new Date(),
        },
      ],
      future,
    );
    expect(inserted).toBe(1);

    const asCurrent = await searchCatalogByTrigram({
      normalizedQuery: "מלט אפור לבדיקה",
      region: "center",
    });
    expect(asCurrent.some((r) => r.supplierKey === SK)).toBe(false);

    const asScanned = await searchCatalogByTrigram({
      normalizedQuery: "מלט אפור לבדיקה",
      region: "center",
      statuses: ["scanned"],
    });
    expect(asScanned.some((r) => r.supplierKey === SK)).toBe(true);

    const prunedNone = await pruneExpiredScanned(new Date(Date.now() - 1000));
    expect(prunedNone).toBeGreaterThanOrEqual(0);
    const stillThere = await prisma.catalogProduct.count({ where: { supplierKey: SK } });
    expect(stillThere).toBe(1);

    const prunedAll = await pruneExpiredScanned(new Date(Date.now() + 120_000));
    expect(prunedAll).toBeGreaterThanOrEqual(1);
    const gone = await prisma.catalogProduct.count({ where: { supplierKey: SK } });
    expect(gone).toBe(0);
  });
});
