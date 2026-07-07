# Tutorial Factory — Production Dashboard

> **Generated file — do not hand-edit.** Regenerate with `npm run build:tutorial-index && npm run build:dashboard` after adding/updating a tutorial. Source data: `tutorial-index.json`.

Generated: 2026-07-07T03:17:51.106Z

## Production Statistics

- **Total tutorials tracked:** 20 (goal: 150+)
- **Content-complete** (all 11 generator/Playwright assets present): 5 / 20
- **Recorded:** 0 / 20
- **Published** (live on YouTube *and* website *and* Help Center): 0 / 20
- **Overall completion:** 64.1% — see methodology note below
- **Remaining tutorials to reach the 150+ goal:** 130

> **Overall completion % methodology:** each tutorial has 16 tracked yes/no signals — the 11 content-generation columns in the table below, plus the 5 real-world production fields (recording/editing/YouTube/website/Help Center status, each only counted "done" when its value is literally "Done"). Overall % = (done signals across every tutorial) ÷ (16 × tutorial count). This weights content generation and real production equally, on purpose — a tutorial whose marketing copy is fully generated but has never been recorded is only about 68.8% done by this measure, not 100%.

> **"Estimated remaining" — a rough heuristic, not a forecast:** this session's real bottleneck per tutorial was authoring its `tutorials/NNN-slug.md` frontmatter and writing + live-testing its Playwright spec — every downstream content asset (help/faq/youtube/linkedin/facebook/shorts/email/seo/guidde/synthesia) is already a ~zero-marginal-cost `npm run generate:tutorials` re-run once those two human inputs exist, since that generator logic is built once and reused automatically. At 20 tutorials done, there are **130 tutorials' worth of frontmatter + Playwright-spec authoring** left before the content-generation side of the 150+ goal is met. Real-world video production (recording/editing/uploading/publishing) has **zero historical data in this repo** — nothing has actually been recorded yet for any tutorial — so no time estimate is given for that side; it needs a real estimate from whoever owns video production, not a number guessed here.

## Status Legend

✅ Complete / Done &nbsp;&nbsp; 🟡 In progress &nbsp;&nbsp; 🔴 Missing / Not started

## Tutorial Status

| Tutorial | Feature Area | Status | Markdown | Help | FAQ | SEO | YouTube | Facebook | LinkedIn | Email | Playwright | Guidde | Synthesia | Recorded | Edited | Published |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Create a Customer in BantooBooks | Customers | Content Complete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Create a Supplier in BantooBooks | Suppliers | Content Complete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Create a Sales Invoice in BantooBooks | Sales & Invoicing | Content Complete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Record a Customer Receipt in BantooBooks | Receipts | Content Complete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Add an Inventory Item in BantooBooks | Inventory | Content Complete | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Edit a Customer's Details in BantooBooks | Customers | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| View a Customer's Statement in BantooBooks | Reports | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Add Notes to a Customer in BantooBooks | Customers | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Issue a Credit Note in BantooBooks | Sales & Invoicing | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Record a Cash Sale in BantooBooks | Sales & Invoicing | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Edit a Sales Invoice in BantooBooks | Sales & Invoicing | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Create a Purchase Invoice in BantooBooks | Purchasing | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Record a Goods Receipt in BantooBooks | Inventory | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Issue a Debit Note in BantooBooks | Purchasing | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Record a Supplier Payment in BantooBooks | Payments | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Issue a Refund Receipt in BantooBooks | Receipts | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Adjust Inventory in BantooBooks | Inventory | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Write Off Damaged or Expired Inventory in BantooBooks | Inventory | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Respond to a Low-Stock Reorder Suggestion in BantooBooks | Inventory | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |
| Add a Bank or Cash Account in BantooBooks | Banking | Drafted | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | 🔴 | 🔴 | 🔴 |

See `missing-assets.md` for a plain-language per-tutorial breakdown of exactly what's missing, and `tutorial-index.json` for the full underlying data (including the `shorts`/`twitter` asset and the raw, ungrouped 5-field production status not shown as separate columns above).

