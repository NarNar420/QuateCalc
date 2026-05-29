import type { Region, ScrapeRunStatus } from "@prisma/client";
import { prisma } from "../client.js";

/** Ensure a supplier row exists (idempotent) and return it. */
export async function upsertSupplier(params: {
  key: string;
  name: string;
  baseUrl: string;
}) {
  return prisma.supplier.upsert({
    where: { key: params.key },
    update: { name: params.name, baseUrl: params.baseUrl },
    create: params,
  });
}

/** Open a new scrape run (status defaults to `failed` until finalized). */
export async function startScrapeRun(params: {
  supplierId: string;
  supplierKey: string;
  region: Region;
}) {
  return prisma.scrapeRun.create({ data: { ...params } });
}

/** Finalize a scrape run with its health summary. */
export async function finishScrapeRun(
  id: string,
  data: {
    status: ScrapeRunStatus;
    productCount: number;
    errorCount: number;
    nullPriceRate: number;
    promoted: boolean;
    notes?: string;
  },
) {
  return prisma.scrapeRun.update({
    where: { id },
    data: { ...data, finishedAt: new Date() },
  });
}

/** Recent runs for an ops dashboard. */
export async function listRecentRuns(limit = 50) {
  return prisma.scrapeRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
