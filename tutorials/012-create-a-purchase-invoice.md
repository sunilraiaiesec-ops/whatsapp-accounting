---
tutorial_id: create-a-purchase-invoice
title: "Create a Purchase Invoice in BantooBooks"
feature_area: "Purchasing"
audience: "Shop owners, distributors, and bookkeepers who receive bills from suppliers"
goal: "Record a bill from a supplier for goods or services bought on credit, so BantooBooks tracks what you owe them."
prerequisites:
  - "At least one supplier already exists (see 'Create a Supplier in BantooBooks')."
  - "At least one expense account exists (BantooBooks creates default expense accounts like '6300 — Transport & fuel' for every new organization)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  supplier: "SOCATRAF Transport SARL"
  supplierRef: "FAC-4471"
  billDate: "2026-07-06"
  dueDate: "2026-08-05"
  description: "Delivery of stock from Douala warehouse to Yaoundé depot — July"
  quantity: "1"
  unitPrice: "180,000"
  taxRate: "19.25"
  expenseAccount: "6300 — Transport & fuel"
  notes: "Monthly transport contract — July deliveries."
  billTotal: "214,650 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Purchase Invoices" from the sidebar.'
  - step: 2
    action: 'Click "New purchase invoice".'
  - step: 3
    action: 'On the New Purchase Invoice page, open the "Supplier" dropdown and select "SOCATRAF Transport SARL".'
  - step: 4
    action: 'Type "FAC-4471" into "Supplier''s reference (optional)".'
  - step: 5
    action: 'Confirm "Bill date" already shows today''s date, then set "Due date (optional)" to a date 30 days out.'
  - step: 6
    action: 'In the line-items table, type "Delivery of stock from Douala warehouse to Yaoundé depot — July" into the "Description" cell.'
  - step: 7
    action: 'Confirm "Qty" already shows "1", then type "180,000" into "Unit price".'
  - step: 8
    action: 'Type "19.25" into "Tax %".'
  - step: 9
    action: 'Open the "Expense / asset account" dropdown for the line and select "6300 — Transport & fuel".'
  - step: 10
    action: 'Type "Monthly transport contract — July deliveries." into "Notes (optional)".'
  - step: 11
    action: 'Check the total shown at the bottom right of the table shows "214,650".'
  - step: 12
    action: 'Click "Save bill".'
  - step: 13
    action: 'Confirm the new bill appears at the top of the Purchase Invoices list with status "Unpaid" and amount "214,650".'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Purchase Invoices' link visible."
  - step: 2
    screen: "The Purchase Invoices page (/purchase-invoices), stat cards and list; the pointer clicking 'New purchase invoice' in the page header."
  - step: 3
    screen: "The New Purchase Invoice page (/purchase-invoices/new), Supplier dropdown open."
  - step: 4
    screen: "The 'Supplier's reference (optional)' field."
  - step: 5
    screen: "The Bill date and Due date (optional) fields."
  - step: 6
    screen: "The line-items table, Description cell."
  - step: 7
    screen: "The line-items table, Qty and Unit price cells."
  - step: 8
    screen: "The line-items table, Tax % cell."
  - step: 9
    screen: "The line-items table, 'Expense / asset account' dropdown cell."
  - step: 10
    screen: "The Notes (optional) textarea below the table."
  - step: 11
    screen: "The totals row at the bottom right of the line-items table."
  - step: 12
    screen: "The bottom of the form, with the 'Save bill' button."
  - step: 13
    screen: "The Purchase Invoices list page, showing the new row at the top with its status badge."
voiceover_script:
  - step: 1
    line: "When a supplier bills you for something you'll pay for later, BantooBooks calls this a purchase invoice. Open Purchase Invoices from the sidebar."
  - step: 2
    line: "Tap 'New purchase invoice'."
  - step: 3
    line: "Choose which supplier this bill is from."
  - step: 4
    line: "If they gave you their own invoice number, note it here — it's optional, but useful for matching against their paperwork later."
  - step: 5
    line: "The bill date defaults to today. Setting a due date helps you keep track of when payment is expected."
  - step: 6
    line: "Describe what this bill is for."
  - step: 7
    line: "Set the quantity and the price they charged."
  - step: 8
    line: "Add the tax rate that applies — again, 19.25 percent VAT is standard for most goods and services in Cameroon."
  - step: 9
    line: "Choose which expense or asset account this cost belongs to — here it's transport and fuel."
  - step: 10
    line: "Add a note if it helps you remember the details later."
  - step: 11
    line: "Check the total before saving."
  - step: 12
    line: "Tap 'Save bill'."
  - step: 13
    line: "And there it is — a new bill, marked 'Unpaid' until you pay your supplier, and now counted as money you owe them."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Purchase Invoices' sidebar link."
  - step: 2
    highlight: "Circle the 'New purchase invoice' button."
  - step: 3
    highlight: "Zoom on the Supplier dropdown and the selected name."
  - step: 4
    highlight: "Highlight the Supplier's reference field."
  - step: 5
    highlight: "Highlight the Bill date and Due date fields."
  - step: 6
    highlight: "Highlight the Description cell as text is typed."
  - step: 7
    highlight: "Highlight the Qty and Unit price cells."
  - step: 8
    highlight: "Highlight the Tax % cell."
  - step: 9
    highlight: "Zoom on the Expense / asset account dropdown and selected value."
  - step: 10
    highlight: "Highlight the Notes textarea."
  - step: 11
    highlight: "Box the total figure at the bottom right of the table."
  - step: 12
    highlight: "Zoom on the 'Save bill' button on click."
  - step: 13
    highlight: "Circle the new row, its 'Unpaid' status badge, and the amount column."
expected_result: "A new purchase invoice for 214,650 XAF from 'SOCATRAF Transport SARL' is created and appears at the top of the Purchase Invoices list, with status 'Unpaid' and reference 'FAC-4471'. This amount is added to your Accounts Payable — money you owe this supplier — until it's paid."
short_youtube_title: "How to Create a Purchase Invoice in BantooBooks"
youtube_description: |
  See how to record a bill from a supplier in BantooBooks by creating a
  purchase invoice — track what you owe for goods or services bought on
  credit, apply tax automatically, and set a due date so you never miss a
  payment.

  What you'll learn:
  - How to start a new purchase invoice (bill) from the sidebar
  - Which expense or asset account a supplier bill should post to
  - What "Unpaid" status means and how it becomes money you owe
help_center_article: |
  ## Why create a purchase invoice?

  A purchase invoice — sometimes just called a "bill" — records a cost your
  business owes a supplier for later payment, rather than paying them on the
  spot. BantooBooks adds the amount to your Accounts Payable, tracking who
  you owe money to and how much, until you pay it.

  ## Steps

  Open "Purchase Invoices" from the sidebar and click "New purchase
  invoice". Choose the Supplier, optionally add their own invoice number
  under "Supplier's reference", and confirm the Bill date. Setting a Due
  date is optional but recommended so you know when payment is expected.

  In the line-items table, describe what the bill is for, set the Quantity
  and Unit price, and add a Tax % if it applies. Choose the "Expense / asset
  account" the cost belongs to — things like transport, rent, or general
  expenses are common choices. Add Notes if useful, then click "Save bill".

  ## Tip

  Purchase invoices are for expenses and services, not for receiving
  physical stock from a supplier — use "Goods Receipt" instead when you're
  restocking inventory, since that properly updates your stock levels as
  well as what you owe.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com; no prior setup
  needed, though having "Create a supplier" already recorded makes picking a
  supplier from the dropdown feel more natural.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on step 9 (Expense / asset account) — call out that
  this list only shows expense and non-control asset accounts, not
  Inventory on hand, since that's handled by Goods Receipts instead.
  Click precision: the "Expense / asset account" dropdown is a per-line
  select inside the table row — click directly inside the cell, not the
  column header.
synthesia_script: |
  When a supplier bills you for something you'll pay for later — a service,
  a delivery, an expense — BantooBooks calls that a purchase invoice.

  Start a new one, and choose which supplier it's from.

  If they gave you their own invoice number, you can note it here, and set
  a due date so you know when payment is expected.

  Describe what the bill is for, set the quantity and price, and add any
  tax that applies. Choose which expense account the cost belongs to —
  transport, rent, or general expenses are common choices.

  Save it, and BantooBooks adds this amount to what you owe that supplier —
  marked unpaid, until you settle it with a payment.
---

# Create a Purchase Invoice in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
