---
tutorial_id: create-a-sales-invoice
title: "Create a Sales Invoice in BantooBooks"
feature_area: "Sales & Invoicing"
audience: "Shop owners, distributors, and bookkeepers who sell on credit"
goal: "Create a sales invoice for a customer so BantooBooks tracks the sale and what they still owe you."
prerequisites:
  - "At least one customer already exists (see 'Create a Customer in BantooBooks')."
  - "At least one income account exists (BantooBooks creates a default '4000 — Sales' account for every new organization)."
  - "Optionally, at least one inventory item exists so you can pick it from the line-item dropdown instead of typing a description by hand."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Alimentation Baobab Douala"
  reference: "PO-2031"
  invoiceDate: "2026-07-06"
  dueDate: "2026-08-05"
  item: "SD-0001 — Coca-Cola 33cl x24"
  description: "Coca-Cola 33cl x24"
  quantity: "5"
  unitPrice: "5,200"
  taxRate: "19.25"
  incomeAccount: "4000 — Sales"
  notes: "Delivery within 3 working days."
  invoiceTotal: "31,005 XAF"
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "+ Create invoice" pill under "Create actions".'
  - step: 2
    action: 'On the New Sales Invoice page, under "Invoice details", open the "Customer" dropdown and select "Alimentation Baobab Douala".'
  - step: 3
    action: 'Type "PO-2031" into "Reference (optional)".'
  - step: 4
    action: 'Confirm "Invoice date" already shows today''s date, then set "Due date (optional)" to a date 30 days out.'
  - step: 5
    action: 'In the "Line items" table, use the "Item" dropdown on the first row to select "SD-0001 — Coca-Cola 33cl x24" — this auto-fills the Description and Unit price.'
  - step: 6
    action: 'Change "Qty" to "5".'
  - step: 7
    action: 'Type "19.25" into the "Tax %" column for that line.'
  - step: 8
    action: 'Confirm "Income account" for the line shows "4000 — Sales".'
  - step: 9
    action: 'Type "Delivery within 3 working days." into "Notes (optional)".'
  - step: 10
    action: 'Check the "Invoice total" at the bottom right of the line-items card shows "31,005 XAF".'
  - step: 11
    action: 'Click "Save invoice".'
  - step: 12
    action: 'Confirm the new invoice appears at the top of the Sales Invoices list with status "Unpaid" and amount "31,005".'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard, showing the 'Create actions' row."
  - step: 2
    screen: "The New Sales Invoice page (/sales-invoices/new), 'Invoice details' card at the top, with the Customer dropdown open."
  - step: 3
    screen: "The 'Invoice details' card, Reference field."
  - step: 4
    screen: "The 'Invoice details' card, Invoice date and Due date fields."
  - step: 5
    screen: "The 'Line items' card, first row, Item dropdown open showing the inventory catalog."
  - step: 6
    screen: "The 'Line items' table, Qty column for the first row."
  - step: 7
    screen: "The 'Line items' table, Tax % column for the first row."
  - step: 8
    screen: "The 'Line items' table, Income account column for the first row."
  - step: 9
    screen: "The Notes textarea at the bottom of the form."
  - step: 10
    screen: "The totals block on the right of the Line items card, showing Subtotal, Tax, and Invoice total."
  - step: 11
    screen: "The bottom action bar with the 'Save invoice' button."
  - step: 12
    screen: "The Sales Invoices list page (/sales-invoices), showing the new row with its status badge."
voiceover_script:
  - step: 1
    line: "To bill a customer for something they'll pay later, we create a sales invoice. Tap 'Create invoice' from your dashboard."
  - step: 2
    line: "Choose which customer this invoice is for — we'll pick 'Alimentation Baobab Douala'."
  - step: 3
    line: "If they gave you a purchase order or reference number, you can note it here. It's optional."
  - step: 4
    line: "The invoice date is set to today automatically. Let's also set a due date, so you know when payment is expected."
  - step: 5
    line: "Now let's add what we're selling. If the product is already in your inventory, just pick it from this list — BantooBooks fills in the description and price for you."
  - step: 6
    line: "We're selling 5 cases this time, so let's update the quantity."
  - step: 7
    line: "Add the tax rate that applies — for most goods in Cameroon that's 19.25 percent VAT."
  - step: 8
    line: "This tells BantooBooks which income account the sale belongs to — 'Sales' is the right one here."
  - step: 9
    line: "You can add a note for the customer, like delivery details — totally optional."
  - step: 10
    line: "Check the total looks right before saving — BantooBooks calculates this for you automatically, including tax."
  - step: 11
    line: "Tap 'Save invoice' to record the sale."
  - step: 12
    line: "And there it is — a new invoice, marked 'Unpaid' until your customer pays you. This amount now also shows up as money this customer owes you."
on_screen_highlights:
  - step: 1
    highlight: "Circle the '+ Create invoice' pill."
  - step: 2
    highlight: "Zoom on the Customer dropdown and the selected name."
  - step: 3
    highlight: "Highlight the Reference field."
  - step: 4
    highlight: "Highlight the Invoice date and Due date fields."
  - step: 5
    highlight: "Zoom on the Item dropdown and the auto-filled Description/Unit price after selection."
  - step: 6
    highlight: "Highlight the Qty field as it changes to 5."
  - step: 7
    highlight: "Highlight the Tax % field."
  - step: 8
    highlight: "Highlight the Income account column."
  - step: 9
    highlight: "Highlight the Notes textarea."
  - step: 10
    highlight: "Box the whole totals block, especially the final 'Invoice total' figure."
  - step: 11
    highlight: "Zoom on the 'Save invoice' button."
  - step: 12
    highlight: "Circle the new row, its 'Unpaid' status badge, and the amount column."
expected_result: "A new sales invoice is created and appears at the top of the Sales Invoices list, showing the customer 'Alimentation Baobab Douala', a status badge reading 'Unpaid', and a total of 31,005 XAF. The customer's balance on the Customers page increases by the same amount."
short_youtube_title: "How to Create a Sales Invoice in BantooBooks"
youtube_description: |
  See exactly how to bill a customer in BantooBooks by creating a sales
  invoice — pick the customer, add line items straight from your inventory,
  apply tax automatically, and set a due date. Perfect for shop owners and
  distributors who sell on credit terms.

  What you'll learn:
  - How to start a new sales invoice from your dashboard
  - How picking an inventory item auto-fills the price
  - How tax and totals are calculated for you
  - What "Unpaid" status means and where it shows up next
help_center_article: |
  ## Why create a sales invoice?

  A sales invoice records a sale where the customer will pay you later,
  rather than on the spot. BantooBooks adds the amount to your Accounts
  Receivable — in other words, it keeps track of who owes you money, and how
  much, until they pay.

  ## Steps

  From your dashboard, click "Create invoice" (or open Sales Invoices from the
  sidebar and click "New invoice"). Under "Invoice details", choose the
  Customer from the dropdown, optionally add a Reference (like a purchase
  order number), and confirm the Invoice date. Setting a Due date is optional
  but recommended so you know when to expect payment.

  Under "Line items", if the product you're selling is already in your
  inventory, pick it from the Item dropdown on the left of each row —
  BantooBooks will fill in the description and unit price for you
  automatically. Otherwise, just type a Description by hand. Set the
  Quantity, check the Unit price, and add a Tax % if it applies (19.25% VAT is
  standard for most goods in Cameroon). Confirm the Income account for the
  line — "Sales" is the right choice for most everyday sales. Click "+ Add
  line" if you're invoicing more than one product.

  You can add a Notes message for the customer at the bottom (like delivery
  instructions or payment terms), then click "Save invoice".

  ## Tip

  Your new invoice starts out with status "Unpaid". Once your customer pays
  you — in full or in part — record it as a Receipt against this customer, and
  the status will update automatically.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com and, if possible,
  first complete the "Create a customer" tutorial recording (or already have
  "Alimentation Baobab Douala" in the list) so this invoice's customer
  dropdown search feels natural rather than scrolling through ~120 names.
  Blur/avoid: don't linger on the full customer dropdown list (it contains
  ~120 other fictional demo names) — open it, type a few letters of "Baobab"
  to filter, then select.
  Pacing: pause on the moment the Item dropdown auto-fills Description and
  Unit price — this is the single most useful "aha" moment in the tutorial.
  Click precision: the tax % and unit price inputs are narrow, right-aligned
  number fields — click directly in the cell before typing, and clear any
  existing "0" placeholder rather than appending to it.
synthesia_script: |
  Let's create a sales invoice — this is how you bill a customer for goods
  they'll pay for later, instead of paying you right away.

  Start a new invoice and choose which customer it's for.

  Set the invoice date, and if you'd like, a due date so you know when to
  expect payment.

  Now add what you're selling. If the product is already in your inventory,
  BantooBooks fills in the price for you automatically once you pick it.
  Otherwise, just type a short description.

  Set the quantity, and add tax if it applies — for most goods in Cameroon,
  that's around nineteen and a quarter percent VAT.

  BantooBooks adds everything up for you automatically, including tax, so you
  can see the final total before you save.

  Save the invoice, and it's done. The invoice starts out marked "Unpaid,"
  and that same amount now shows up as money this customer owes you — right
  up until they pay.
---

# Create a Sales Invoice in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
