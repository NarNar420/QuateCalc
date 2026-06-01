import { z } from "zod";
import { MatchedLineItemSchema } from "./matching.js";
import { RegionSchema } from "./common.js";

export const ScanJobStatusSchema = z.enum([
  "pending",
  "scanning",
  "matching",
  "complete",
  "failed",
]);
export type ScanJobStatus = z.infer<typeof ScanJobStatusSchema>;

export const SupplierScanStateSchema = z.enum(["pending", "running", "done", "error"]);
export type SupplierScanState = z.infer<typeof SupplierScanStateSchema>;

export const ScanProgressSchema = z.object({
  perSupplier: z.record(z.string(), SupplierScanStateSchema).default({}),
});
export type ScanProgress = z.infer<typeof ScanProgressSchema>;

/** The shape GET /api/scan/:id returns to the client. */
export const ScanJobViewSchema = z.object({
  id: z.string(),
  region: RegionSchema,
  status: ScanJobStatusSchema,
  progress: ScanProgressSchema,
  items: z.array(MatchedLineItemSchema).nullable(),
  error: z.string().nullable(),
});
export type ScanJobView = z.infer<typeof ScanJobViewSchema>;
