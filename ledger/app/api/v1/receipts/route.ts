import { z } from "zod";

import { ApiAuthError, requireApiContext } from "@/lib/api/context";
import { error, json } from "@/lib/api/http";
import { bankAndCashAccounts, listAccounts } from "@/lib/accounts";
import { createReceipt, listReceipts, DocumentError } from "@/lib/documents";
import { parseAmount } from "@/lib/money";
import { LedgerError } from "@/lib/ledger";

export { OPTIONS } from "@/lib/api/route-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const receipts = await listReceipts(ctx.orgId);
    return json({
      receipts: receipts.map((r) => ({
        id: r.id,
        number: r.number,
        date: r.date.toISOString().slice(0, 10),
        total: r.total,
        reference: r.reference,
        description: r.description,
        bankAccount: r.bankAccount.name,
        party: r.party?.name ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}

const createSchema = z.object({
  date: z.string().optional(),
  bankAccountId: z.string().min(1),
  partyId: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        amount: z.union([z.string(), z.number()]),
        memo: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error("Invalid JSON body");
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
    if (Number.isNaN(date.getTime())) return error("Invalid date");

    try {
      const receipt = await createReceipt(ctx.orgId, {
        date,
        bankAccountId: parsed.data.bankAccountId,
        partyId: parsed.data.partyId ?? null,
        reference: parsed.data.reference ?? null,
        description: parsed.data.description ?? null,
        lines: parsed.data.lines.map((l) => ({
          accountId: l.accountId,
          amount: parseAmount(l.amount, ctx.baseCurrency),
          memo: l.memo ?? null,
        })),
      });

      return json(
        {
          receipt: {
            id: receipt.id,
            number: receipt.number,
            total: receipt.total,
          },
        },
        201,
      );
    } catch (err) {
      if (err instanceof DocumentError || err instanceof LedgerError) {
        return error(err.message);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ApiAuthError) return error("Unauthorized", 401);
    throw err;
  }
}
