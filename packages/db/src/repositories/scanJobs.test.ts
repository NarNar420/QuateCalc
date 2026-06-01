import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../client.js";
import {
  claimNextScanJob,
  completeScanJob,
  createScanJob,
  failScanJob,
  getScanJob,
  updateScanJobProgress,
} from "./scanJobs.js";

const created: string[] = [];
afterAll(async () => {
  if (created.length) await prisma.scanJob.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("scanJobs repo", () => {
  it("creates, claims, progresses, and completes a job", async () => {
    const job = await createScanJob({
      region: "center",
      lines: [{ id: "l1", rawText: "מלט", quantity: 1 }],
    });
    created.push(job.id);
    expect(job.status).toBe("pending");

    const claimed = await claimNextScanJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("scanning");

    const again = await claimNextScanJob();
    expect(again?.id).not.toBe(job.id);

    await updateScanJobProgress(job.id, { perSupplier: { homecenter: "done" } });
    const mid = await getScanJob(job.id);
    expect((mid?.progress as { perSupplier: Record<string, string> }).perSupplier.homecenter).toBe("done");

    await completeScanJob(job.id, [{ ok: true }]);
    const done = await getScanJob(job.id);
    expect(done?.status).toBe("complete");
    expect(done?.result).toEqual([{ ok: true }]);
  });

  it("fails a job with an error message", async () => {
    const job = await createScanJob({ region: "center", lines: [] });
    created.push(job.id);
    await failScanJob(job.id, "boom");
    const done = await getScanJob(job.id);
    expect(done?.status).toBe("failed");
    expect(done?.error).toBe("boom");
  });
});
