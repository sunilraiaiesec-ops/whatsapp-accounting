type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export class EmailError extends Error {}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Bantoo Books <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.info("[email:dev]", { to: input.to, subject: input.subject, text: input.text });
      return;
    }
    throw new EmailError(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM in your environment.",
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[email] Resend error:", res.status, body);
    throw new EmailError("Could not send email. Please try again in a few minutes.");
  }
}

export async function sendResetVerificationCode(email: string, code: string, orgName: string) {
  const subject = "Confirm reset of your Bantoo Books data";
  const text =
    `You requested to reset all accounting data for "${orgName}".\n\n` +
    `Your verification code is: ${code}\n\n` +
    `This code expires in 15 minutes. If you did not request this, ignore this email.\n\n` +
    `— Bantoo Books`;

  const html =
    `<p>You requested to reset all accounting data for <strong>${escapeHtml(orgName)}</strong>.</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:24px 0">${code}</p>` +
    `<p>This code expires in <strong>15 minutes</strong>.</p>` +
    `<p>If you did not request this, you can safely ignore this email.</p>` +
    `<p>— Bantoo Books</p>`;

  await sendEmail({ to: email, subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
