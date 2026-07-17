// SMS delivery for phone verification / phone-based account recovery — an
// ADDITIONAL verification channel alongside email, never a substitute for
// it (see lib/auth/account.ts and app/actions/auth.ts's loginAction, which
// gates only on emailVerified). Mirrors lib/email.ts's shape: a raw send
// primitive that throws on failure, plus template helpers built on top.

type SendSmsInput = {
  to: string; // E.164, e.g. "+237612345678"
  body: string;
};

export class SmsError extends Error {}

export async function sendSms(input: SendSmsInput): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info("[sms:dev]", { to: input.to, body: input.body });
      return;
    }
    throw new SmsError(
      "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in your environment.",
    );
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: input.to, From: from, Body: input.body }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[sms] Twilio error:", res.status, body);
    throw new SmsError("Could not send SMS. Please try again in a few minutes.");
  }
}

export async function sendPhoneVerificationCode(phone: string, code: string) {
  await sendSms({
    to: phone,
    body: `Your Bantoo Books verification code is ${code}. It expires in 10 minutes. Never share this code with anyone.`,
  });
}

export async function sendPhoneRecoveryCode(phone: string, code: string) {
  await sendSms({
    to: phone,
    body: `Your Bantoo Books account recovery code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
  });
}
