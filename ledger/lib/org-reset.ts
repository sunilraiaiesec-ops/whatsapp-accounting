import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sendResetVerificationCode, EmailError } from "@/lib/email";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";

export class OrgResetError extends Error {}

const CODE_TTL_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 2 * 60 * 1000;

export type ResetStatus =
  | { step: "none" }
  | { step: "awaiting_code"; requestId: string; codeExpiresAt: string; email: string }
  | { step: "cooldown"; requestId: string; deleteAllowedAt: string }
  | { step: "ready"; requestId: string };

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function getActiveResetRequest(orgId: string) {
  return prisma.orgResetRequest.findFirst({
    where: { orgId, completedAt: null, cancelledAt: null },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
  });
}

export async function getResetStatus(orgId: string): Promise<ResetStatus> {
  const req = await getActiveResetRequest(orgId);
  if (!req) return { step: "none" };

  const now = Date.now();

  if (!req.verifiedAt) {
    if (req.codeExpiresAt.getTime() <= now) {
      return { step: "none" };
    }
    return {
      step: "awaiting_code",
      requestId: req.id,
      codeExpiresAt: req.codeExpiresAt.toISOString(),
      email: req.user.email,
    };
  }

  if (!req.deleteAllowedAt || req.deleteAllowedAt.getTime() > now) {
    return {
      step: "cooldown",
      requestId: req.id,
      deleteAllowedAt: req.deleteAllowedAt!.toISOString(),
    };
  }

  return { step: "ready", requestId: req.id };
}

export async function requestOrgReset(orgId: string, userId: string, userEmail: string, orgName: string) {
  const recent = await prisma.orgResetRequest.findFirst({
    where: {
      orgId,
      userId,
      completedAt: null,
      cancelledAt: null,
      createdAt: { gt: new Date(Date.now() - REQUEST_COOLDOWN_MS) },
    },
  });
  if (recent) {
    throw new OrgResetError("Please wait a couple of minutes before requesting another code.");
  }

  await prisma.orgResetRequest.updateMany({
    where: { orgId, completedAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });

  const code = generateCode();
  const codeHash = await hashPassword(code);
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);

  const request = await prisma.orgResetRequest.create({
    data: { orgId, userId, codeHash, codeExpiresAt },
  });

  try {
    await sendResetVerificationCode(userEmail, code, orgName);
  } catch (err) {
    await prisma.orgResetRequest.update({
      where: { id: request.id },
      data: { cancelledAt: new Date() },
    });
    if (err instanceof EmailError) throw new OrgResetError(err.message);
    throw err;
  }

  return {
    requestId: request.id,
    codeExpiresAt: codeExpiresAt.toISOString(),
    email: userEmail,
  };
}

export async function verifyOrgResetCode(orgId: string, userId: string, code: string) {
  const req = await getActiveResetRequest(orgId);
  if (!req || req.userId !== userId) {
    throw new OrgResetError("No active reset request. Request a new verification code.");
  }
  if (req.verifiedAt) {
    throw new OrgResetError("This request is already verified.");
  }
  if (req.codeExpiresAt.getTime() <= Date.now()) {
    throw new OrgResetError("Verification code expired. Request a new code.");
  }

  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6) {
    throw new OrgResetError("Enter the 6-digit code from your email.");
  }

  const ok = await verifyPassword(normalized, req.codeHash);
  if (!ok) {
    throw new OrgResetError("Incorrect verification code.");
  }

  const verifiedAt = new Date();
  const deleteAllowedAt = new Date(verifiedAt.getTime() + COOLDOWN_MS);

  await prisma.orgResetRequest.update({
    where: { id: req.id },
    data: { verifiedAt, deleteAllowedAt },
  });

  return { deleteAllowedAt: deleteAllowedAt.toISOString() };
}

export async function cancelOrgReset(orgId: string, userId: string) {
  await prisma.orgResetRequest.updateMany({
    where: { orgId, userId, completedAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
}

export async function executeOrgReset(
  orgId: string,
  userId: string,
  orgName: string,
  confirmName: string,
) {
  if (confirmName.trim() !== orgName.trim()) {
    throw new OrgResetError("Business name does not match. Type it exactly as shown.");
  }

  const req = await getActiveResetRequest(orgId);
  if (!req || req.userId !== userId) {
    throw new OrgResetError("No active reset request.");
  }
  if (!req.verifiedAt || !req.deleteAllowedAt) {
    throw new OrgResetError("Verify your email code first.");
  }
  if (req.deleteAllowedAt.getTime() > Date.now()) {
    throw new OrgResetError("Cool-off period has not finished yet.");
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new OrgResetError("Organization not found.");

  await prisma.$transaction(async (tx) => {
    await tx.receiptLine.deleteMany({ where: { receipt: { orgId } } });
    await tx.receipt.deleteMany({ where: { orgId } });
    await tx.paymentLine.deleteMany({ where: { payment: { orgId } } });
    await tx.payment.deleteMany({ where: { orgId } });
    await tx.salesInvoiceLine.deleteMany({ where: { invoice: { orgId } } });
    await tx.salesInvoice.deleteMany({ where: { orgId } });
    await tx.purchaseInvoiceLine.deleteMany({ where: { invoice: { orgId } } });
    await tx.purchaseInvoice.deleteMany({ where: { orgId } });
    await tx.creditNoteLine.deleteMany({ where: { note: { orgId } } });
    await tx.creditNote.deleteMany({ where: { orgId } });
    await tx.debitNoteLine.deleteMany({ where: { note: { orgId } } });
    await tx.debitNote.deleteMany({ where: { orgId } });
    await tx.goodsReceiptLine.deleteMany({ where: { receipt: { orgId } } });
    await tx.goodsReceipt.deleteMany({ where: { orgId } });
    await tx.inventoryWriteOffLine.deleteMany({ where: { writeOff: { orgId } } });
    await tx.inventoryWriteOff.deleteMany({ where: { orgId } });
    await tx.interAccountTransfer.deleteMany({ where: { orgId } });
    await tx.journalLine.deleteMany({ where: { orgId } });
    await tx.journalEntry.deleteMany({ where: { orgId } });
    await tx.party.deleteMany({ where: { orgId } });
    await tx.inventoryItem.deleteMany({ where: { orgId } });
    await tx.account.deleteMany({ where: { orgId } });

    await tx.account.createMany({
      data: DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
        orgId,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype ?? null,
        isControl: a.isControl ?? false,
        currency: org.baseCurrency,
      })),
    });

    await tx.orgResetRequest.update({
      where: { id: req.id },
      data: { completedAt: new Date() },
    });
  });

  return { ok: true as const };
}
