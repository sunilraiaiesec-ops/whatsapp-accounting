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

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://books.bantoobooks.com").replace(/\/$/, "");
}

export async function sendPasswordResetEmail(email: string, link: string) {
  const subject = "Reset your Bantoo Books password";
  const text =
    `We received a request to reset your Bantoo Books password.\n\n` +
    `Reset it here (link expires in 1 hour):\n${link}\n\n` +
    `If you did not request this, you can safely ignore this email — your password will not change.\n\n` +
    `— Bantoo Books`;
  const html =
    `<p>We received a request to reset your Bantoo Books password.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
    `<p style="color:#64748b;font-size:13px">This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>` +
    `<p>— Bantoo Books</p>`;
  await sendEmail({ to: email, subject, html, text });
}

export async function sendVerificationEmail(email: string, link: string) {
  const subject = "Confirm your email for Bantoo Books";
  const text =
    `Welcome to Bantoo Books! Please confirm your email address to secure your account.\n\n` +
    `Confirm here (link expires in 24 hours):\n${link}\n\n` +
    `If you did not create this account, you can ignore this email.\n\n` +
    `— Bantoo Books`;
  const html =
    `<p>Welcome to Bantoo Books! Please confirm your email address to secure your account.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirm email</a></p>` +
    `<p style="color:#64748b;font-size:13px">This link expires in <strong>24 hours</strong>. If you did not create this account, you can ignore this email.</p>` +
    `<p>— Bantoo Books</p>`;
  await sendEmail({ to: email, subject, html, text });
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

// Where the "New Member" signup notification goes — overridable per
// environment, defaults to the address the team actually monitors.
export function signupNotificationEmail(): string {
  return process.env.SIGNUP_NOTIFICATION_EMAIL ?? "members@bantoobooks.com";
}

export type NewMemberNotificationInput = {
  name: string;
  email: string;
  phone: string;
  whatsapp?: string | null;
  orgName: string;
  baseCurrency: string;
};

export async function sendNewMemberNotification(input: NewMemberNotificationInput) {
  const subject = "New Member";
  const whatsappLine = input.whatsapp ? input.whatsapp : "Same as phone number";

  const text =
    `A new member signed up on Bantoo Books.\n\n` +
    `Company name: ${input.orgName}\n` +
    `Name: ${input.name}\n` +
    `Email: ${input.email}\n` +
    `Phone number: ${input.phone}\n` +
    `WhatsApp number: ${whatsappLine}\n` +
    `Base currency: ${input.baseCurrency}\n`;

  const html =
    `<p>A new member signed up on Bantoo Books.</p>` +
    `<table style="border-collapse:collapse;margin-top:8px">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Company name</td><td><strong>${escapeHtml(input.orgName)}</strong></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Name</td><td>${escapeHtml(input.name)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td>${escapeHtml(input.email)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Phone number</td><td>${escapeHtml(input.phone)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">WhatsApp number</td><td>${escapeHtml(whatsappLine)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Base currency</td><td>${escapeHtml(input.baseCurrency)}</td></tr>` +
    `</table>`;

  await sendEmail({ to: signupNotificationEmail(), subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
