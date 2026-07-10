export type QuizOption = { id: string; text: string };
export type QuizQuestion = {
  id: number;
  section: string;
  prompt: string;
  options: QuizOption[];
  correctId: string;
  explanation: string;
};

export const QUIZ_TITLE = "Bantoo Books Know-How Quiz";
export const QUIZ_SUBTITLE = "40 questions · repos, GitHub, PostgreSQL, demo ops & deployment";

export const QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    section: "Repository & GitHub",
    prompt: "What is the GitHub repository name for this project?",
    options: [
      { id: "a", text: "bantoobooks/ledger" },
      { id: "b", text: "sunilraiaiesec-ops/whatsapp-accounting" },
      { id: "c", text: "bantoobooks/production" },
      { id: "d", text: "sunilraiaiesec-ops/bantoo-books" },
    ],
    correctId: "b",
    explanation: "The monorepo lives at github.com/sunilraiaiesec-ops/whatsapp-accounting.",
  },
  {
    id: 2,
    section: "Repository & GitHub",
    prompt: "Which folder contains the books.bantoobooks.com application?",
    options: [
      { id: "a", text: "web/" },
      { id: "b", text: "mobile/" },
      { id: "c", text: "ledger/" },
      { id: "d", text: "Root Python files (main.py)" },
    ],
    correctId: "c",
    explanation: "Bantoo Books is the Next.js app in ledger/.",
  },
  {
    id: 3,
    section: "Repository & GitHub",
    prompt: "The GitHub repo is best described as:",
    options: [
      { id: "a", text: "Only Bantoo Books" },
      { id: "b", text: "A monorepo: Bantoo Books + WhatsApp stack + automation + tutorials" },
      { id: "c", text: "Only a mobile app" },
      { id: "d", text: "Only tutorial markdown" },
    ],
    correctId: "b",
    explanation: "whatsapp-accounting contains ledger/, Python WhatsApp code, automation/, etc.",
  },
  {
    id: 4,
    section: "Repository & GitHub",
    prompt: "Which should NEVER be committed to GitHub?",
    options: [
      { id: "a", text: "prisma/schema.prisma" },
      { id: "b", text: ".env with DATABASE_URL and API keys" },
      { id: "c", text: "package.json" },
      { id: "d", text: "vercel.json" },
    ],
    correctId: "b",
    explanation: "Secrets in .env stay local or in Vercel env settings.",
  },
  {
    id: 5,
    section: "Repository & GitHub",
    prompt: "What is the production URL for Bantoo Books?",
    options: [
      { id: "a", text: "https://bantoobooks.com" },
      { id: "b", text: "https://books.bantoobooks.com" },
      { id: "c", text: "https://whatsapp-accounting.onrender.com" },
      { id: "d", text: "https://ledger.vercel.app" },
    ],
    correctId: "b",
    explanation: "Production is books.bantoobooks.com.",
  },
  {
    id: 6,
    section: "Tech Stack",
    prompt: "Bantoo Books is built with which framework?",
    options: [
      { id: "a", text: "Django" },
      { id: "b", text: "Next.js (App Router)" },
      { id: "c", text: "Flask" },
      { id: "d", text: "Ruby on Rails" },
    ],
    correctId: "b",
    explanation: "ledger/ uses Next.js 16 App Router.",
  },
  {
    id: 7,
    section: "Tech Stack",
    prompt: "Which ORM talks to PostgreSQL?",
    options: [
      { id: "a", text: "SQLAlchemy" },
      { id: "b", text: "Prisma" },
      { id: "c", text: "TypeORM" },
      { id: "d", text: "Raw SQL only" },
    ],
    correctId: "b",
    explanation: "Schema is in prisma/schema.prisma.",
  },
  {
    id: 8,
    section: "Tech Stack",
    prompt: "Which database does production use?",
    options: [
      { id: "a", text: "MySQL" },
      { id: "b", text: "MongoDB" },
      { id: "c", text: "PostgreSQL on Neon" },
      { id: "d", text: "SQLite" },
    ],
    correctId: "c",
    explanation: "DATABASE_URL points to Neon Postgres.",
  },
  {
    id: 9,
    section: "Tech Stack",
    prompt: "Default currency for demo companies?",
    options: [
      { id: "a", text: "USD" },
      { id: "b", text: "EUR" },
      { id: "c", text: "XAF" },
      { id: "d", text: "GBP" },
    ],
    correctId: "c",
    explanation: "Cameroon franc — zero decimal places in the UI.",
  },
  {
    id: 10,
    section: "Tech Stack",
    prompt: "Test runner in ledger/?",
    options: [
      { id: "a", text: "Jest" },
      { id: "b", text: "Vitest" },
      { id: "c", text: "pytest" },
      { id: "d", text: "Mocha" },
    ],
    correctId: "b",
    explanation: "npm test runs Vitest.",
  },
  {
    id: 11,
    section: "Tech Stack",
    prompt: "Money is stored in the ledger as:",
    options: [
      { id: "a", text: "Float" },
      { id: "b", text: "String" },
      { id: "c", text: "BigInt minor units" },
      { id: "d", text: "JS number only" },
    ],
    correctId: "c",
    explanation: "BigInt whole francs for XAF.",
  },
  {
    id: 12,
    section: "Architecture",
    prompt: "Accounting model used?",
    options: [
      { id: "a", text: "Single-entry only" },
      { id: "b", text: "Double-entry (debits = credits)" },
      { id: "c", text: "Spreadsheet import only" },
      { id: "d", text: "Blockchain" },
    ],
    correctId: "b",
    explanation: "postEntry() enforces balanced journal entries.",
  },
  {
    id: 13,
    section: "Architecture",
    prompt: "Multi-tenancy structure?",
    options: [
      { id: "a", text: "One DB per customer" },
      { id: "b", text: "Organization + User + Membership" },
      { id: "c", text: "Single shared user" },
      { id: "d", text: "Country subdomains only" },
    ],
    correctId: "b",
    explanation: "Every org is isolated by orgId on all tables.",
  },
  {
    id: 14,
    section: "Architecture",
    prompt: "Legacy WhatsApp Python app lives where?",
    options: [
      { id: "a", text: "Inside ledger/" },
      { id: "b", text: "Repo root (main.py, db.py) — separate from Bantoo Books" },
      { id: "c", text: "Not in this repo" },
      { id: "d", text: "Inside mobile/" },
    ],
    correctId: "b",
    explanation: "Python stack is unrelated to books.bantoobooks.com.",
  },
  {
    id: 15,
    section: "Architecture",
    prompt: "Ask Bantoo AI (when configured) uses:",
    options: [
      { id: "a", text: "Gemini only" },
      { id: "b", text: "OpenAI (gpt-4o-mini + whisper)" },
      { id: "c", text: "Claude only" },
      { id: "d", text: "No AI ever" },
    ],
    correctId: "b",
    explanation: "OPENAI_API_KEY enables photo/voice; text has rule fallback.",
  },
  {
    id: 16,
    section: "Architecture",
    prompt: "Transactional email provider?",
    options: [
      { id: "a", text: "SendGrid" },
      { id: "b", text: "Resend" },
      { id: "c", text: "AWS SES" },
      { id: "d", text: "Gmail SMTP" },
    ],
    correctId: "b",
    explanation: "RESEND_API_KEY + EMAIL_FROM in env.",
  },
  {
    id: 17,
    section: "Database",
    prompt: "Database schema is defined in:",
    options: [
      { id: "a", text: "ledger/db.sql" },
      { id: "b", text: "ledger/prisma/schema.prisma" },
      { id: "c", text: "categories.py" },
      { id: "d", text: "lib/schema.ts" },
    ],
    correctId: "b",
    explanation: "Prisma is the source of truth.",
  },
  {
    id: 18,
    section: "Database",
    prompt: "npm run db:migrate does what?",
    options: [
      { id: "a", text: "Deletes all data" },
      { id: "b", text: "Creates/applies Prisma migrations (dev)" },
      { id: "c", text: "Deploys to Vercel" },
      { id: "d", text: "Seeds demos only" },
    ],
    correctId: "b",
    explanation: "prisma migrate dev for local schema changes.",
  },
  {
    id: 19,
    section: "Database",
    prompt: "Production migrations run via:",
    options: [
      { id: "a", text: "Manual SSH" },
      { id: "b", text: "prisma migrate deploy in vercel-build" },
      { id: "c", text: "db:push on every request" },
      { id: "d", text: "Python db.py" },
    ],
    correctId: "b",
    explanation: "vercel-build runs migrate deploy before next build.",
  },
  {
    id: 20,
    section: "Database",
    prompt: "DATABASE_URL is:",
    options: [
      { id: "a", text: "SQLite file path" },
      { id: "b", text: "PostgreSQL connection string" },
      { id: "c", text: "Redis URL" },
      { id: "d", text: "GitHub token" },
    ],
    correctId: "b",
    explanation: "Points at Neon Postgres in production.",
  },
  {
    id: 21,
    section: "Database",
    prompt: "Demo company data in production lives:",
    options: [
      { id: "a", text: "Only in JSON in git" },
      { id: "b", text: "In shared Neon DB (separate org rows)" },
      { id: "c", text: "Browser localStorage" },
      { id: "d", text: "Vercel filesystem" },
    ],
    correctId: "b",
    explanation: "Same database as real customers; demo orgs identified by email.",
  },
  {
    id: 22,
    section: "Deployment",
    prompt: "Bantoo Books is deployed on:",
    options: [
      { id: "a", text: "Render" },
      { id: "b", text: "Vercel" },
      { id: "c", text: "AWS EC2" },
      { id: "d", text: "Heroku" },
    ],
    correctId: "b",
    explanation: "ledger/vercel.json + vercel-build script.",
  },
  {
    id: 23,
    section: "Deployment",
    prompt: "vercel-build does:",
    options: [
      { id: "a", text: "Only next build" },
      { id: "b", text: "prisma generate + migrate deploy + next build" },
      { id: "c", text: "Runs main.py" },
      { id: "d", text: "Zips the repo" },
    ],
    correctId: "b",
    explanation: "Schema is applied on each production deploy.",
  },
  {
    id: 24,
    section: "Deployment",
    prompt: "Required env var for session signing?",
    options: [
      { id: "a", text: "OPENAI_API_KEY" },
      { id: "b", text: "AUTH_SECRET" },
      { id: "c", text: "VERIFY_TOKEN" },
      { id: "d", text: "GEMINI_MODEL" },
    ],
    correctId: "b",
    explanation: "Used for login sessions in ledger/.",
  },
  {
    id: 25,
    section: "Deployment",
    prompt: ".env files in ledger/ are:",
    options: [
      { id: "a", text: "Committed to GitHub" },
      { id: "b", text: "Gitignored" },
      { id: "c", text: "Stored in Neon" },
      { id: "d", text: "In demo-data.ts" },
    ],
    correctId: "b",
    explanation: "Secrets go in Vercel dashboard or local .env only.",
  },
  {
    id: 26,
    section: "Demo accounts",
    prompt: "How many demo organizations are maintained?",
    options: [
      { id: "a", text: "1" },
      { id: "b", text: "3" },
      { id: "c", text: "10" },
      { id: "d", text: "50" },
    ],
    correctId: "b",
    explanation: "Central, Atlantic, and Prime.",
  },
  {
    id: 27,
    section: "Demo accounts",
    prompt: "Primary tutorial demo email?",
    options: [
      { id: "a", text: "demo@example.com" },
      { id: "b", text: "central.demo@bantoobooks.com" },
      { id: "c", text: "admin@bantoobooks.com" },
      { id: "d", text: "test@neon.tech" },
    ],
    correctId: "b",
    explanation: "Central Distribution Cameroon SARL.",
  },
  {
    id: 28,
    section: "Demo accounts",
    prompt: "Shared demo password?",
    options: [
      { id: "a", text: "password123" },
      { id: "b", text: "DemoBooks2025!" },
      { id: "c", text: "Bantoo2024" },
      { id: "d", text: "admin" },
    ],
    correctId: "b",
    explanation: "All three demo accounts use DemoBooks2025!",
  },
  {
    id: 29,
    section: "Demo accounts",
    prompt: "Demo orgs are identified by:",
    options: [
      { id: "a", text: "isDemo DB column" },
      { id: "b", text: "Owner emails *.demo@bantoobooks.com" },
      { id: "c", text: "Org name contains test" },
      { id: "d", text: "UUID prefix" },
    ],
    correctId: "b",
    explanation: "lib/demo-accounts.ts — no isDemo flag in schema.",
  },
  {
    id: 30,
    section: "Demo accounts",
    prompt: "Why did demo refresh silently fail before the fix?",
    options: [
      { id: "a", text: "Wrong DATABASE_URL" },
      { id: "b", text: "isDemoOrgId checked role 'owner' but DB has 'OWNER'" },
      { id: "c", text: "Vercel was down" },
      { id: "d", text: "Reminders query broken" },
    ],
    correctId: "b",
    explanation: "Case mismatch caused refresh to no-op.",
  },
  {
    id: 31,
    section: "Demo accounts",
    prompt: "Force-refresh all demo orgs without full reseed:",
    options: [
      { id: "a", text: "npm run dev" },
      { id: "b", text: "SEED_DEMO=1 npm run refresh:demo" },
      { id: "c", text: "python seed.py" },
      { id: "d", text: "DEMO_RESEED=1 npm run build" },
    ],
    correctId: "b",
    explanation: "From ledger/ directory against DATABASE_URL.",
  },
  {
    id: 32,
    section: "Demo accounts",
    prompt: "Healthy payment reminders per demo account?",
    options: [
      { id: "a", text: "600–700" },
      { id: "b", text: "6–8 (2–3 overdue)" },
      { id: "c", text: "Always 0" },
      { id: "d", text: "100+" },
    ],
    correctId: "b",
    explanation: "refreshDemoAccountData() targets this profile.",
  },
  {
    id: 33,
    section: "Demo accounts",
    prompt: "Login uses maybeRefreshDemoAccount; CLI uses:",
    options: [
      { id: "a", text: "refreshDemoAccountData (force, no cooldown)" },
      { id: "b", text: "Full reseed every time" },
      { id: "c", text: "Manual SQL only" },
      { id: "d", text: "Nothing" },
    ],
    correctId: "a",
    explanation: "CLI refresh-demo.ts passes force: true.",
  },
  {
    id: 34,
    section: "Scripts & folders",
    prompt: "Demo catalog and fictional names live in:",
    options: [
      { id: "a", text: "ledger/scripts/demo-data.ts" },
      { id: "b", text: "party_seeds.py" },
      { id: "c", text: "generated/tutorials/" },
      { id: "d", text: "whatsapp_flow.py" },
    ],
    correctId: "a",
    explanation: "CATALOG, buildCustomers(), buildSuppliers().",
  },
  {
    id: 35,
    section: "Scripts & folders",
    prompt: "party_seeds.py is for:",
    options: [
      { id: "a", text: "Bantoo Books demos" },
      { id: "b", text: "Legacy Python WhatsApp (RR Foods)" },
      { id: "c", text: "Neon directly" },
      { id: "d", text: "GitHub Actions" },
    ],
    correctId: "b",
    explanation: "Separate from ledger/ demo seeder.",
  },
  {
    id: 36,
    section: "Scripts & folders",
    prompt: "Playwright automation base URL env var?",
    options: [
      { id: "a", text: "DATABASE_URL" },
      { id: "b", text: "BANTOO_BASE_URL" },
      { id: "c", text: "GITHUB_TOKEN" },
      { id: "d", text: "AUTH_SECRET" },
    ],
    correctId: "b",
    explanation: "Defaults to localhost; prod is books.bantoobooks.com.",
  },
  {
    id: 37,
    section: "Scripts & folders",
    prompt: "Payment reminders count invoices where:",
    options: [
      { id: "a", text: "status = paid" },
      { id: "b", text: "status != paid and dueDate is set" },
      { id: "c", text: "All invoices ever" },
      { id: "d", text: "Purchase invoices only" },
    ],
    correctId: "b",
    explanation: "getDueSoonAndOverdueInvoices() in lib/billing/reminders.ts.",
  },
  {
    id: 38,
    section: "Scripts & folders",
    prompt: "Low-stock alerts compare:",
    options: [
      { id: "a", text: "salePrice vs cost" },
      { id: "b", text: "qtyOnHand vs reorderLevel" },
      { id: "c", text: "Customers vs suppliers" },
      { id: "d", text: "Bank vs zero" },
    ],
    correctId: "b",
    explanation: "countLowStockItems() in lib/reorder.ts.",
  },
  {
    id: 39,
    section: "Operations",
    prompt: "SEED_DEMO=1 is required because:",
    options: [
      { id: "a", text: "Faster tests" },
      { id: "b", text: "Safety gate before writing demo data to DB" },
      { id: "c", text: "Enables dark mode" },
      { id: "d", text: "Vercel requires it" },
    ],
    correctId: "b",
    explanation: "Prevents accidental demo writes.",
  },
  {
    id: 40,
    section: "Operations",
    prompt: "DEMO_RESEED=1 with seed-demo.ts means:",
    options: [
      { id: "a", text: "Refresh dates only" },
      { id: "b", text: "Purge and rebuild all 3 demo orgs from scratch" },
      { id: "c", text: "Delete all real customers" },
      { id: "d", text: "Push to GitHub" },
    ],
    correctId: "b",
    explanation: "Full purge + rebuild, not just rolling refresh.",
  },
];

export function scoreAnswers(answers: Record<number, string>) {
  let correct = 0;
  const review = QUESTIONS.map((q) => {
    const picked = answers[q.id] ?? null;
    const ok = picked === q.correctId;
    if (ok) correct++;
    return { question: q, picked, ok };
  });
  return { correct, total: QUESTIONS.length, pct: Math.round((correct / QUESTIONS.length) * 100), review };
}

export function gradeLabel(pct: number) {
  if (pct >= 90) return { label: "You own the stack", color: "text-emerald-700" };
  if (pct >= 70) return { label: "Solid — review demo ops & deploy", color: "text-sky-700" };
  if (pct >= 50) return { label: "Getting there — re-read Sections 4–6", color: "text-amber-700" };
  return { label: "Start with ledger/README.md and npm run dev", color: "text-rose-700" };
}
