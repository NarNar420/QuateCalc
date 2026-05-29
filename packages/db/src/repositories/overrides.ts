import { prisma } from "../client.js";

/** Look up learned overrides for a batch of normalized texts. */
export async function getOverrides(normalizedTexts: string[]) {
  if (normalizedTexts.length === 0) return new Map<string, string>();
  const rows = await prisma.matchOverride.findMany({
    where: { rawTextNormalized: { in: normalizedTexts } },
  });
  return new Map(rows.map((r) => [r.rawTextNormalized, r.productId]));
}

/** Persist a user correction so future matches prefer it. */
export async function saveOverride(rawTextNormalized: string, productId: string) {
  return prisma.matchOverride.upsert({
    where: { rawTextNormalized },
    update: { productId },
    create: { rawTextNormalized, productId },
  });
}
