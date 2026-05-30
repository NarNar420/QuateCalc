/**
 * Dev seed: one DEMO supplier + a small building-materials catalog (region=center),
 * marked `current` so matching/UI work end-to-end without a live scrape.
 *
 * The supplier key is `demo` (NOT `ace`) on purpose: a real ACE live scrape uses
 * supplierKey `ace`, and promote archives the prior `current` rows for that
 * supplier+region. Sharing a key would make the seed and a live scrape clobber
 * each other. A distinct `demo` key lets seeded sample data and real scraped data
 * coexist in the same dev database.
 *
 * Run: pnpm seed
 */
import { normalizeHebrew } from "@quatecalc/units";
import { prisma } from "./client.js";
import type { Region, Unit } from "@prisma/client";

const SUPPLIER = { key: "demo", name: "ספק לדוגמה", baseUrl: "https://example.com" };

interface SeedProduct {
  name: string;
  unit: Unit;
  packSize?: number;
  price: number;
  sku?: string;
}

const PRODUCTS: SeedProduct[] = [
  { name: "מלט אפור CEM II 50 קג", unit: "bag", packSize: 50, price: 28.9, sku: "CEM-50" },
  { name: "מלט לבן 25 קג", unit: "bag", packSize: 25, price: 39.9, sku: "CEMW-25" },
  { name: 'דבק לריצוף אפור 25 ק"ג', unit: "bag", packSize: 25, price: 34.5, sku: "GLUE-25" },
  { name: "חול מיוצב במשטח טון", unit: "ton", price: 220, sku: "SAND-T" },
  { name: "בלוק איטונג 20 ס\"מ", unit: "piece", price: 12.4, sku: "YTONG-20" },
  { name: "בלוק בטון 20 ס\"מ", unit: "piece", price: 6.8, sku: "BLK-20" },
  { name: 'גבס לבן 12.5 מ"מ לוח', unit: "sheet", price: 41.0, sku: "GYP-12" },
  { name: "פרופיל גבס CD 60", unit: "meter", price: 7.2, sku: "PROF-CD" },
  { name: 'צבע אקרילי לבן 18 ליטר', unit: "pack", packSize: 18, price: 189.0, sku: "PAINT-18" },
  { name: 'שפכטל מוכן 20 ק"ג', unit: "bag", packSize: 20, price: 96.0, sku: "SPK-20" },
  { name: 'קרמיקה גרניט פורצלן 60x60 מ"ר', unit: "square_meter", price: 49.9, sku: "TILE-60" },
  { name: "בידוד פוליאתילן גליל", unit: "roll", price: 145.0, sku: "ISO-R" },
  { name: 'ברזל זיון קוטר 12 מ"מ ק"ג', unit: "kilogram", price: 4.6, sku: "REBAR-12" },
  { name: "טיח גבס פנים 30 קג", unit: "bag", packSize: 30, price: 33.0, sku: "PLAS-30" },
  { name: 'איטום ביטומני גליל 10 מ"ר', unit: "roll", packSize: 10, price: 165.0, sku: "BIT-10" },
];

async function main() {
  const supplier = await prisma.supplier.upsert({
    where: { key: SUPPLIER.key },
    update: { name: SUPPLIER.name, baseUrl: SUPPLIER.baseUrl },
    create: SUPPLIER,
  });

  const region: Region = "center";

  // Reset existing seed rows for idempotency.
  await prisma.catalogProduct.deleteMany({ where: { supplierKey: SUPPLIER.key } });

  const now = new Date();
  await prisma.catalogProduct.createMany({
    data: PRODUCTS.map((p) => ({
      supplierId: supplier.id,
      supplierKey: SUPPLIER.key,
      sku: p.sku ?? null,
      name: p.name,
      nameNormalized: normalizeHebrew(p.name),
      unit: p.unit,
      packSize: p.packSize ?? 1,
      price: p.price,
      currency: "ILS",
      region,
      url: `${SUPPLIER.baseUrl}/product/${p.sku ?? ""}`,
      status: "current",
      scrapedAt: now,
    })),
  });

  const count = await prisma.catalogProduct.count({ where: { supplierKey: SUPPLIER.key } });
  console.log(`Seeded supplier "${SUPPLIER.key}" with ${count} catalog products (region=${region}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
