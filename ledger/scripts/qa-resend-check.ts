// Talks directly to the Resend API to diagnose email delivery.
// Requires RESEND_API_KEY (and optionally EMAIL_FROM) in the environment.
// Run: set -a; source .env; set +a; npx tsx scripts/qa-resend-check.ts sunil@melsun.ca
async function main() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Bantoo Books <onboarding@resend.dev>";
  const to = process.argv[2] ?? "sunil@melsun.ca";

  if (!key) {
    console.log("RESEND_API_KEY is NOT set in the environment. Add it to ledger/.env.");
    process.exit(1);
  }
  console.log(`Key: ${key.slice(0, 5)}…${key.slice(-2)}   From: ${from}   To: ${to}\n`);

  // 1) Domain verification status
  const dres = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log(`=== Domains (HTTP ${dres.status}) ===`);
  try {
    const data = (await dres.json()) as { data?: { name: string; status: string; region?: string }[] };
    if (!data.data || data.data.length === 0) {
      console.log("  (no domains added — you can only send from onboarding@resend.dev, to your own account email)");
    } else {
      for (const d of data.data) console.log(`  ${d.name}: ${d.status}${d.region ? ` [${d.region}]` : ""}`);
    }
  } catch {
    console.log("  " + (await dres.text()));
  }

  // 2) Live test send
  const sres = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Bantoo Books — delivery test",
      text: "This is a test email from the Bantoo Books diagnostic. If you received it, sending works.",
    }),
  });
  console.log(`\n=== Test send (HTTP ${sres.status}) ===`);
  console.log("  " + (await sres.text()));
  console.log(
    sres.ok
      ? "\n=> Resend ACCEPTED the send. Check the inbox/spam for the To address."
      : "\n=> Resend REJECTED the send. The message above is the exact reason.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
