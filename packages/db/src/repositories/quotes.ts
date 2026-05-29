import type { Prisma } from "@prisma/client";
import { prisma } from "../client.js";

export interface SaveQuoteInput {
  title?: string;
  customerName?: string;
  region: Prisma.QuoteCreateInput["region"];
  currency: string;
  marginPercent: number;
  vatPercent: number;
  overhead: Prisma.InputJsonValue;
  totals: Prisma.InputJsonValue;
  lines: Array<{
    rawText?: string;
    rawUnit?: string;
    description: string;
    quantity: number;
    unit: Prisma.QuoteLineCreateManyQuoteInput["unit"];
    unitPrice: number;
    lineTotal: number;
    matchedProductId?: string;
    matchStatus?: Prisma.QuoteLineCreateManyQuoteInput["matchStatus"];
    order: number;
  }>;
}

/** Persist a fully computed quote and its lines. */
export async function saveQuote(input: SaveQuoteInput) {
  const { lines, ...quote } = input;
  return prisma.quote.create({
    data: {
      ...quote,
      lines: { create: lines },
    },
    include: { lines: { orderBy: { order: "asc" } } },
  });
}

export async function getQuote(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: { lines: { orderBy: { order: "asc" } } },
  });
}
