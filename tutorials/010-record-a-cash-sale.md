---
tutorial_id: record-a-cash-sale
title: "Record a Cash Sale in BantooBooks"
feature_area: "Sales & Invoicing"
audience: "Shop owners and cashiers who sell over the counter and get paid immediately"
goal: "Record a sale that's paid for on the spot, without creating a separate invoice and receipt."
prerequisites:
  - "At least one bank or cash account exists (BantooBooks creates a default '1000 — Cash on hand' account for every new organization)."
  - "Optionally, at least one inventory item exists so you can pick it from the line-item dropdown instead of typing a description by hand."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Walk-in / no customer"
  depositTo: "1000 — Cash on hand"
  date: "2026-07-06"
  item: "Omo Detergent 900g x12"
  description: "Omo Detergent 900g x12"
  quantity: "2"
  unitPrice: "18,700"
  taxRate: "19.25"
  incomeAccount: "4000 — Sales"
  totalReceived: "44,600 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Sales Receipts" from the sidebar.'
  - step: 2
    action: 'Click "New sales receipt".'
  - step: 3
    action: 'On the New Sales Receipt page, leave "Customer (optional)" set to "Walk-in / no customer" since this is a counter sale.'
  - step: 4
    action: 'Open the "Deposit to" dropdown and select "1000 — Cash on hand".'
  - step: 5
    action: 'Confirm "Date" already shows today''s date.'
  - step: 6
    action: 'In the "Line items" table, use the "Item" dropdown on the first row to select "Omo Detergent 900g x12" — this auto-fills the Description and Unit price.'
  - step: 7
    action: 'Change "Qty" to "2".'
  - step: 8
    action: 'Type "19.25" into "Tax %".'
  - step: 9
    action: 'Confirm "Income account" for the line shows "4000 — Sales".'
  - step: 10
    action: 'Check "Total received" shows "44,600 XAF".'
  - step: 11
    action: 'Click "Save sales receipt".'
  - step: 12
    action: 'Confirm the new sales receipt appears at the top of the Sales Receipts list, showing "Walk-in" as the customer and "1000 — Cash on hand" as the account deposited to.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Sales Receipts' link visible."
  - step: 2
    screen: "The Sales Receipts page (/sales-receipts), stat cards and list; the pointer clicking 'New sales receipt' in the page header."
  - step: 3
    screen: "The New Sales Receipt page (/sales-receipts/new), 'Details' card, Customer (optional) dropdown left on 'Walk-in / no customer'."
  - step: 4
    screen: "The Details card, 'Deposit to' dropdown open."
  - step: 5
    screen: "The Details card, Date field."
  - step: 6
    screen: "The Line items card, first row, Item dropdown open."
  - step: 7
    screen: "The Line items table, Qty column."
  - step: 8
    screen: "The Line items table, Tax % column."
  - step: 9
    screen: "The Line items table, Income account column."
  - step: 10
    screen: "The 'Total received' figure at the bottom right of the Line items card."
  - step: 11
    screen: "The bottom action bar with the 'Save sales receipt' button."
  - step: 12
    screen: "The Sales Receipts list page, showing the new row at the top."
voiceover_script:
  - step: 1
    line: "When someone buys something and pays right away, you don't need a separate invoice and receipt — BantooBooks has a single screen for that: Sales Receipts. Open it from the sidebar."
  - step: 2
    line: "Tap 'New sales receipt'."
  - step: 3
    line: "If it's a walk-in sale and you don't need to track this particular buyer as a customer, you can leave this as 'Walk-in / no customer'."
  - step: 4
    line: "Choose which account the cash landed in — for a counter sale, that's usually your cash drawer."
  - step: 5
    line: "The date defaults to today, which is almost always correct."
  - step: 6
    line: "Add what was sold. Pick it from your inventory if it's already there, and BantooBooks fills in the price automatically."
  - step: 7
    line: "Set the quantity — here, two cartons."
  - step: 8
    line: "Add tax if it applies, just like on an invoice."
  - step: 9
    line: "This tells BantooBooks which income account the sale belongs to."
  - step: 10
    line: "Double-check the total before saving."
  - step: 11
    line: "Tap 'Save sales receipt'."
  - step: 12
    line: "And that's it — in one step, BantooBooks records the sale as income, reduces your stock, and adds the cash straight to your cash account. No invoice needed."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Sales Receipts' sidebar link."
  - step: 2
    highlight: "Circle the 'New sales receipt' button."
  - step: 3
    highlight: "Highlight the Customer (optional) dropdown showing 'Walk-in / no customer'."
  - step: 4
    highlight: "Zoom on the 'Deposit to' dropdown and selected account."
  - step: 5
    highlight: "Highlight the Date field."
  - step: 6
    highlight: "Zoom on the Item dropdown and the auto-filled Description/Unit price after selection."
  - step: 7
    highlight: "Highlight the Qty field as it changes to 2."
  - step: 8
    highlight: "Highlight the Tax % field."
  - step: 9
    highlight: "Highlight the Income account column."
  - step: 10
    highlight: "Box the 'Total received' figure."
  - step: 11
    highlight: "Zoom on the 'Save sales receipt' button on click."
  - step: 12
    highlight: "Circle the new row, its 'Walk-in' customer label, and the 'Cash on hand' account column."
expected_result: "A new sales receipt for 44,600 XAF appears at the top of the Sales Receipts list, showing 'Walk-in' as the customer and '1000 — Cash on hand' as the account. The Cash on hand account balance increases by 44,600 XAF and inventory for Omo Detergent 900g x12 decreases by 2 cartons, with no invoice ever created."
short_youtube_title: "How to Record a Cash Sale in BantooBooks"
youtube_description: |
  Learn how to record a cash sale in BantooBooks — a sale that's paid for on
  the spot, over the counter, with no invoice or separate receipt needed.
  Perfect for shop owners and cashiers doing walk-in business.

  What you'll learn:
  - The difference between a sales invoice and a sales receipt
  - How to record a walk-in sale with no customer attached
  - How a sales receipt updates your cash balance and inventory in one step
help_center_article: |
  ## Why use a sales receipt instead of an invoice?

  A sales invoice is for a sale a customer will pay for later. A sales
  receipt is for the opposite case: money changes hands immediately, right
  at the point of sale — like a walk-in customer paying cash for goods over
  the counter. Recording it as a sales receipt does everything in one step:
  it records the income, reduces stock, and adds the money straight to your
  bank or cash account, without ever creating an unpaid invoice first.

  ## Steps

  Open "Sales Receipts" from the sidebar and click "New sales receipt". The
  Customer field is optional — leave it as "Walk-in / no customer" if you
  don't need to track who specifically bought it, or pick a customer if you
  do. Choose which account the money went into under "Deposit to" (usually
  your cash account for an over-the-counter sale), and confirm the Date.

  In the Line items table, pick the product from the Item dropdown if it's
  in your inventory — BantooBooks fills in the description and price for
  you. Set the Quantity and Tax %, and confirm the Income account. Click
  "Save sales receipt" once the total looks right.

  ## Tip

  If you're selling to someone whose name you do want to track over time —
  even if they always pay cash — pick them from the Customer dropdown
  instead of leaving it on "Walk-in". That way their purchase history still
  shows up on their customer page later.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com; no prior setup
  needed since this flow doesn't depend on an existing invoice.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on step 3 to make clear "Walk-in / no customer" is
  the default and a deliberate, valid choice, not a mistake to fix.
  Click precision: the Item dropdown is a plain <select> with every
  inventory item listed by name — there is no search/filter box, so scroll
  through carefully to find "Omo Detergent 900g x12" rather than typing.
synthesia_script: |
  Not every sale needs an invoice. When someone pays you on the spot, over
  the counter, BantooBooks has a faster way to record it: a sales receipt.

  Start a new sales receipt. If you don't need to track exactly who bought
  it, you can leave it as a walk-in sale with no customer attached.

  Choose which account the money went into — usually your cash account for
  a counter sale — and confirm the date.

  Add what was sold. If it's in your inventory, BantooBooks fills in the
  price automatically once you pick it. Set the quantity and any tax that
  applies.

  Save it, and in one single step, BantooBooks records the income, reduces
  your stock, and adds the money to your cash balance — no separate invoice
  or receipt required.
---

# Record a Cash Sale in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
