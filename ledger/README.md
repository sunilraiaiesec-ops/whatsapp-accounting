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

## Ask Bantoo (AI capture)

The **Ask Bantoo** modal (✨ button / Cmd-Ctrl+K) lets shopkeepers add inventory,
receipts, purchases, and payments by **text, photo, or voice**. Input is sent to
an AI extraction endpoint (`/api/bantoo/extract`, voice via
`/api/bantoo/transcribe`), classified into one of `add_inventory_item`,
`receive_stock`, `supplier_purchase`, `customer_payment`, `expense`,
`sales_receipt`, `create_customer`, `create_supplier`, one of the **customer
intelligence** actions (`edit_customer`, `view_customer`, `customer_balance`,
`add_customer_note`, `contact_customer`, `customer_query`,
`unsupported_customer_action`), one of the **supplier intelligence** actions
(`edit_supplier`, `view_supplier`, `supplier_balance`, `add_supplier_note`,
`contact_supplier`, `supplier_query`, `unsupported_supplier_action`), one of
the **sales** actions (`sales_invoice` for a credit sale/invoice,
`credit_note`, `refund_receipt`, `view_sales_invoice`, or
`unsupported_sales_action` for out-of-scope requests like editing/voiding/
emailing an existing invoice or applying a payment to one specific invoice
number), or `unknown`, validated with zod, and shown for confirm/edit before
any write. Writes reuse the existing `lib/documents.ts` / `lib/inventory.ts`
helpers.

- Set `OPENAI_API_KEY` in `.env` to enable photo, voice, and AI text extraction
  (uses `gpt-4o-mini` for text+vision and `whisper-1` for transcription).
- Without a key, plain **text** commands still work via the built-in rule-based
  parser; photo/voice return a clear "not configured" message.
- The provider lives in a single swappable module (`lib/ai/provider.ts`).

## Scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server                     |
| `npm run test`      | Run unit tests (Vitest)                  |
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
