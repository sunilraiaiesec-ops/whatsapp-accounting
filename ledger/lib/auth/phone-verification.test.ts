import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// --- Mocks: no DB / network. -------------------------------------------------
const verificationCodeCreate = vi.fn();
const verificationCodeUpdateMany = vi.fn();
const verificationCodeUpdate = vi.fn();
const verificationCodeFindFirst = vi.fn();
const userUpdate = vi.fn();
const userFindFirst = vi.fn();
const sendPhoneVerificationCode = vi.fn();
const sendPhoneRecoveryCode = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationCode: {
      create: (...args: unknown[]) => verificationCodeCreate(...args),
      updateMany: (...args: unknown[]) => verificationCodeUpdateMany(...args),
      update: (...args: unknown[]) => verificationCodeUpdate(...args),
      findFirst: (...args: unknown[]) => verificationCodeFindFirst(...args),
    },
    user: {
      update: (...args: unknown[]) => userUpdate(...args),
      findFirst: (...args: unknown[]) => userFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendPhoneVerificationCode: (...args: unknown[]) => sendPhoneVerificationCode(...args),
  sendPhoneRecoveryCode: (...args: unknown[]) => sendPhoneRecoveryCode(...args),
}));

const {
  createVerificationCode,
  verifyCode,
  sendPhoneVerification,
  confirmPhoneVerification,
  requestPhoneRecovery,
  confirmPhoneRecovery,
} = await import("@/lib/auth/phone-verification");

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createVerificationCode", () => {
  it("invalidates existing unused codes of the same type, creates a new one, and sends it via SMS", async () => {
    await createVerificationCode("user_1", "+237612345678", "PHONE_VERIFY");

    expect(verificationCodeUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", type: "PHONE_VERIFY", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(verificationCodeCreate).toHaveBeenCalledTimes(1);
    const createArgs = verificationCodeCreate.mock.calls[0][0];
    expect(createArgs.data.userId).toBe("user_1");
    expect(createArgs.data.type).toBe("PHONE_VERIFY");
    expect(createArgs.data.maxAttempts).toBe(5);
    expect(createArgs.data.codeHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex

    expect(sendPhoneVerificationCode).toHaveBeenCalledWith("+237612345678", expect.stringMatching(/^\d{6}$/));
  });

  it("routes PHONE_RECOVERY codes to the recovery SMS template", async () => {
    await createVerificationCode("user_1", "+237612345678", "PHONE_RECOVERY");
    expect(sendPhoneRecoveryCode).toHaveBeenCalled();
    expect(sendPhoneVerificationCode).not.toHaveBeenCalled();
  });

  it("never throws when the SMS send fails", async () => {
    sendPhoneVerificationCode.mockRejectedValueOnce(new Error("Twilio down"));
    await expect(createVerificationCode("user_1", "+237612345678", "PHONE_VERIFY")).resolves.toBeUndefined();
  });
});

describe("verifyCode", () => {
  const baseRecord = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: "code_1",
    userId: "user_1",
    type: "PHONE_VERIFY",
    codeHash: hashCode("123456"),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    maxAttempts: 5,
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  it("returns invalid when no unused code exists", async () => {
    verificationCodeFindFirst.mockResolvedValue(null);
    const result = await verifyCode("user_1", "123456", "PHONE_VERIFY");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns too_many_attempts when the code is already locked out", async () => {
    verificationCodeFindFirst.mockResolvedValue(baseRecord({ attempts: 5 }));
    const result = await verifyCode("user_1", "123456", "PHONE_VERIFY");
    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(verificationCodeUpdate).not.toHaveBeenCalled();
  });

  it("returns expired for a code past its expiry", async () => {
    verificationCodeFindFirst.mockResolvedValue(
      baseRecord({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const result = await verifyCode("user_1", "123456", "PHONE_VERIFY");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("increments attempts and returns invalid on a wrong guess", async () => {
    verificationCodeFindFirst.mockResolvedValue(baseRecord({ attempts: 1 }));
    verificationCodeUpdate.mockResolvedValue(baseRecord({ attempts: 2 }));

    const result = await verifyCode("user_1", "000000", "PHONE_VERIFY");

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(verificationCodeUpdate).toHaveBeenCalledWith({
      where: { id: "code_1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("reports too_many_attempts on the guess that exhausts the limit", async () => {
    verificationCodeFindFirst.mockResolvedValue(baseRecord({ attempts: 4, maxAttempts: 5 }));
    verificationCodeUpdate.mockResolvedValue(baseRecord({ attempts: 5, maxAttempts: 5 }));

    const result = await verifyCode("user_1", "000000", "PHONE_VERIFY");

    expect(result).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("marks the code used and returns ok on a correct guess", async () => {
    verificationCodeFindFirst.mockResolvedValue(baseRecord());
    const result = await verifyCode("user_1", "123456", "PHONE_VERIFY");

    expect(result).toEqual({ ok: true });
    expect(verificationCodeUpdate).toHaveBeenCalledWith({
      where: { id: "code_1" },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("ignores surrounding whitespace in the submitted code", async () => {
    verificationCodeFindFirst.mockResolvedValue(baseRecord());
    const result = await verifyCode("user_1", "  123456  ", "PHONE_VERIFY");
    expect(result).toEqual({ ok: true });
  });
});

describe("sendPhoneVerification / confirmPhoneVerification", () => {
  it("marks the user's phone verified on a correct code", async () => {
    verificationCodeFindFirst.mockResolvedValue({
      id: "code_1",
      userId: "user_1",
      type: "PHONE_VERIFY",
      codeHash: hashCode("654321"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(),
    });

    const result = await confirmPhoneVerification("user_1", "654321");

    expect(result).toEqual({ ok: true });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { phoneVerified: expect.any(Date) },
    });
  });

  it("does not touch the user record on an incorrect code", async () => {
    verificationCodeFindFirst.mockResolvedValue({
      id: "code_1",
      userId: "user_1",
      type: "PHONE_VERIFY",
      codeHash: hashCode("654321"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(),
    });
    verificationCodeUpdate.mockResolvedValue({ attempts: 1, maxAttempts: 5 });

    const result = await confirmPhoneVerification("user_1", "000000");

    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("sendPhoneVerification is a thin wrapper that creates a PHONE_VERIFY code", async () => {
    await sendPhoneVerification("user_1", "+237612345678");
    expect(verificationCodeCreate).toHaveBeenCalledTimes(1);
    expect(verificationCodeCreate.mock.calls[0][0].data.type).toBe("PHONE_VERIFY");
  });
});

describe("requestPhoneRecovery / confirmPhoneRecovery", () => {
  it("no-ops when no user has that phone verified (never reveals existence)", async () => {
    userFindFirst.mockResolvedValue(null);
    await requestPhoneRecovery("+237699999999");
    expect(verificationCodeCreate).not.toHaveBeenCalled();
  });

  it("sends a PHONE_RECOVERY code for a user with that verified phone", async () => {
    userFindFirst.mockResolvedValue({ id: "user_1", phone: "+237612345678", phoneVerified: new Date() });
    await requestPhoneRecovery("+237612345678");
    expect(verificationCodeCreate).toHaveBeenCalledTimes(1);
    expect(verificationCodeCreate.mock.calls[0][0].data.type).toBe("PHONE_RECOVERY");
  });

  it("confirmPhoneRecovery returns invalid when no matching verified-phone user exists", async () => {
    userFindFirst.mockResolvedValue(null);
    const result = await confirmPhoneRecovery("+237699999999", "123456");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("confirmPhoneRecovery returns the userId on success", async () => {
    userFindFirst.mockResolvedValue({ id: "user_1", phone: "+237612345678", phoneVerified: new Date() });
    verificationCodeFindFirst.mockResolvedValue({
      id: "code_1",
      userId: "user_1",
      type: "PHONE_RECOVERY",
      codeHash: hashCode("111222"),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      usedAt: null,
      createdAt: new Date(),
    });

    const result = await confirmPhoneRecovery("+237612345678", "111222");

    expect(result).toEqual({ ok: true, userId: "user_1" });
  });
});
