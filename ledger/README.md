# Ledger

Multi-tenant, double-entry accounting SaaS (manager.io-style). Built with
Next.js 16 (App Router), Prisma 6, PostgreSQL, Tailwind v4.

## What's in the foundation

- **Tenancy:** `Organization` + `User` + `Membership`. Sign-up provisions a new
  organization, seeds a chart of accounts, and creates the owner.
- **Double-entry ledger:** `Account`, `JournalEntry`, `JournalLine`. Every entry
  is posted through `postEntry()` (`lib/ledger.ts`), which enforces
  `total debits == total credits` and verifies accounts belong to the org.
- **Reports:** Trial Balance, Balance Sheet, and Profit & Loss computed straight
  from the ledger (`lib/reports.ts`).
- **UI:** login / signup, dashboard, chart of accounts, journal entries
  (list + post), and the three reports.

Money is stored as `BigInt` minor units; formatting is currency-aware
(`lib/money.ts`). XAF/FCFA uses 0 decimal places.

## Setup

1. Create a Postgres database (Neon, Supabase, or any Postgres) and copy its
   connection string.

2. Configure environment:

   ```bash
   cp .env.example .env
   # then set DATABASE_URL=... and AUTH_SECRET=$(openssl rand -base64 32)
   ```

3. Create the schema and start:

   ```bash
   npm install
   npm run db:push      # or: npm run db:migrate  (creates a migration history)
   npm run dev
   ```

4. Open http://localhost:3000, click **Create one**, and you've got a tenant
   with a full chart of accounts. Post a journal entry and watch the Balance
   Sheet update.

## Scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server                     |
| `npm run db:push`   | Sync the Prisma schema to the database   |
| `npm run db:migrate`| Create + apply a migration               |
| `npm run db:studio` | Browse data in Prisma Studio             |

## Roadmap (next sessions)

- Document types layered over `postEntry()`: Receipts, Payments, Sales/Purchase
  Invoices, Credit/Debit Notes, Inter-account transfers, Inventory.
- Customer & supplier subledger views over the AR/AP control accounts.
- RLS hardening (see `prisma/rls.sql`).
- Import the first real company's books (migration from the WhatsApp-accounting
  Postgres) as tenant #1.
