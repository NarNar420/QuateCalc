import type { Prisma, Region, ScanJob } from "@prisma/client";
import { prisma } from "../client.js";

export interface CreateScanJobInput {
  region: Region;
  lines: Prisma.InputJsonValue;
}

export async function createScanJob(input: CreateScanJobInput): Promise<ScanJob> {
  return prisma.scanJob.create({ data: { region: input.region, lines: input.lines } });
}

export async function getScanJob(id: string): Promise<ScanJob | null> {
  return prisma.scanJob.findUnique({ where: { id } });
}

/**
 * Atomically claim the oldest pending job: flip exactly one `pending` row to
 * `scanning` and return it, or null. FOR UPDATE SKIP LOCKED prevents double-claim.
 */
export async function claimNextScanJob(): Promise<ScanJob | null> {
  const rows = await prisma.$queryRaw<ScanJob[]>`
    UPDATE "ScanJob"
    SET status = 'scanning'::"ScanJobStatus", "startedAt" = now()
    WHERE id = (
      SELECT id FROM "ScanJob"
      WHERE status = 'pending'::"ScanJobStatus"
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function updateScanJobProgress(id: string, progress: Prisma.InputJsonValue): Promise<void> {
  await prisma.scanJob.update({ where: { id }, data: { progress } });
}

export async function completeScanJob(id: string, result: Prisma.InputJsonValue): Promise<void> {
  await prisma.scanJob.update({
    where: { id },
    data: { status: "complete", result, finishedAt: new Date() },
  });
}

export async function failScanJob(id: string, error: string): Promise<void> {
  await prisma.scanJob.update({
    where: { id },
    data: { status: "failed", error, finishedAt: new Date() },
  });
}

/** Sweep stale pending/scanning/matching jobs older than `olderThanMs` to failed. */
export async function sweepStaleScanJobs(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await prisma.scanJob.updateMany({
    where: { status: { in: ["pending", "scanning", "matching"] }, createdAt: { lt: cutoff } },
    data: { status: "failed", error: "stale (swept)", finishedAt: new Date() },
  });
  return res.count;
}
