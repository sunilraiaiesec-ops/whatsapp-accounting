---
tutorial_id: issue-a-credit-note
title: "Issue a Credit Note in BantooBooks"
feature_area: "Sales & Invoicing"
audience: "Shop owners, distributors, and bookkeepers handling customer returns or refunds"
goal: "Issue a credit note for a customer return so BantooBooks reduces what they owe you and reverses the related sale."
prerequisites:
  - "At least one customer with a previous sales invoice already exists (see 'Create a Sales Invoice in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Alimentation Baobab Douala"
  reference: "PO-2031"
  date: "2026-07-06"
  description: "Coca-Cola 33cl x24 — 1 case damaged in transit"
  quantity: "1"
  unitPrice: "5,200"
  taxRate: "19.25"
  incomeAccount: "4000 — Sales"
  notes: "Customer returned 1 damaged case from invoice PO-2031."
  creditNoteTotal: "6,201 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Credit Notes" from the sidebar.'
  - step: 2
    action: 'Click "New credit note".'
  - step: 3
    action: 'On the New Credit Note page, open the "Customer" dropdown and select "Alimentation Baobab Douala".'
  - step: 4
    action: 'Type "PO-2031" into "Reference (optional)".'
  - step: 5
    action: 'Confirm "Date" already shows today''s date.'
  - step: 6
    action: 'In the line-items table, type "Coca-Cola 33cl x24 — 1 case damaged in transit" into the "Description" cell.'
  - step: 7
    action: 'Confirm "Qty" already shows "1", then type "5,200" into "Unit price".'
  - step: 8
    action: 'Type "19.25" into "Tax %".'
  - step: 9
    action: 'Confirm "Income account" shows "4000 — Sales".'
  - step: 10
    action: 'Type "Customer returned 1 damaged case from invoice PO-2031." into "Notes (optional)".'
  - step: 11
    action: 'Check the total shown in the bottom-right of the table shows "6,201".'
  - step: 12
    action: 'Click "Save credit note".'
  - step: 13
    action: 'Confirm the new credit note opens showing status details and the same total, and that it now appears at the top of the Credit Notes list.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Credit Notes' link visible."
  - step: 2
    screen: "The Credit Notes page (/credit-notes), stat cards at the top and the list below; the pointer clicking the 'New credit note' button in the page header."
  - step: 3
    screen: "The New Credit Note page (/credit-notes/new), with the Customer dropdown open."
  - step: 4
    screen: "The Reference (optional) field."
  - step: 5
    screen: "The Date field."
  - step: 6
    screen: "The line-items table, Description cell for the first row."
  - step: 7
    screen: "The line-items table, Qty and Unit price cells."
  - step: 8
    screen: "The line-items table, Tax % cell."
  - step: 9
    screen: "The line-items table, Income account dropdown cell."
  - step: 10
    screen: "The Notes (optional) textarea below the table."
  - step: 11
    screen: "The totals row at the bottom right of the line-items table."
  - step: 12
    screen: "The bottom of the form, with the 'Save credit note' button."
  - step: 13
    screen: "The new credit note's detail page, then the Credit Notes list page showing the new row at the top."
voiceover_script:
  - step: 1
    line: "When a customer returns goods or you need to refund part of a sale, BantooBooks calls this a credit note. Open Credit Notes from the sidebar."
  - step: 2
    line: "Tap 'New credit note' to start one."
  - step: 3
    line: "Choose which customer this credit note is for."
  - step: 4
    line: "If it relates to a specific invoice, you can note the reference here — we'll use the same purchase order number as the original sale."
  - step: 5
    line: "The date defaults to today, which is usually correct."
  - step: 6
    line: "Describe what's being returned or refunded."
  - step: 7
    line: "Set the quantity being returned, and confirm the unit price matches what was originally charged."
  - step: 8
    line: "Add the same tax rate that applied to the original sale."
  - step: 9
    line: "This should be the same income account the original sale used, so the reversal lines up correctly."
  - step: 10
    line: "Add a note explaining why — handy for you and your customer later."
  - step: 11
    line: "Check the total before saving."
  - step: 12
    line: "Tap 'Save credit note'."
  - step: 13
    line: "And that's it — this reduces what the customer owes you by that amount, as if that part of the sale never happened."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Credit Notes' sidebar link."
  - step: 2
    highlight: "Circle the 'New credit note' button."
  - step: 3
    highlight: "Zoom on the Customer dropdown and the selected name."
  - step: 4
    highlight: "Highlight the Reference field."
  - step: 5
    highlight: "Highlight the Date field."
  - step: 6
    highlight: "Highlight the Description cell as text is typed."
  - step: 7
    highlight: "Highlight the Qty and Unit price cells."
  - step: 8
    highlight: "Highlight the Tax % cell."
  - step: 9
    highlight: "Highlight the Income account dropdown."
  - step: 10
    highlight: "Highlight the Notes textarea."
  - step: 11
    highlight: "Box the total figure at the bottom right of the table."
  - step: 12
    highlight: "Zoom on the 'Save credit note' button on click."
  - step: 13
    highlight: "Circle the new row at the top of the Credit Notes list."
expected_result: "A new credit note for 6,201 XAF against 'Alimentation Baobab Douala' is created and appears at the top of the Credit Notes list, referencing 'PO-2031'. The customer's outstanding balance on the Customers page decreases by the same amount."
short_youtube_title: "How to Issue a Credit Note in BantooBooks"
youtube_description: |
  Learn how to issue a credit note in BantooBooks for a customer return or
  refund — it reduces what the customer owes you and reverses the original
  sale, without touching the original invoice itself.

  What you'll learn:
  - Where to find "New credit note" in BantooBooks
  - How to reference the original invoice when returning goods
  - How a credit note affects a customer's balance
help_center_article: |
  ## Why issue a credit note?

  A credit note reverses part or all of a sale — typically because a
  customer returned goods, or you agreed to a partial refund. Instead of
  editing or deleting the original sales invoice (which should stay as an
  accurate record of what actually happened), you issue a separate credit
  note that reduces the customer's balance and reverses the income.

  ## Steps

  Open "Credit Notes" from the sidebar and click "New credit note". Choose
  the Customer, and optionally add a Reference pointing back to the original
  invoice or purchase order number so it's easy to trace later. Confirm the
  Date, then describe what's being returned or refunded in the line-items
  table — set the Quantity, Unit price, and Tax % to match the original
  sale, and confirm the Income account is the same one the sale used. Add a
  Notes explanation if useful, then click "Save credit note".

  ## Tip

  If the returned item is tracked in your inventory, BantooBooks returns the
  quantity to stock automatically as part of saving the credit note — you'll
  see a note on the credit note's detail page confirming it went back into
  stock.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Create a sales invoice" for the same
  customer/invoice reference so the story of "sale, then partial return"
  reads naturally.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on step 9 (Income account) — call out that it should
  match the original sale's account, since getting this wrong is the most
  common mistake.
  Click precision: the line-items table looks similar to the sales invoice
  table but has its own separate "+ Add line" control below the table footer
  — don't confuse this page with the sales invoice form during recording.
synthesia_script: |
  Sometimes a customer returns goods, or you need to refund part of a sale.
  In BantooBooks, that's called a credit note.

  Start a new credit note, and choose which customer it's for.

  If it relates to a specific invoice, you can reference that invoice or
  purchase order number, so it's easy to trace later.

  Describe what's being returned, and set the quantity and price to match
  the original sale, including the same tax rate and the same income
  account.

  Save it, and BantooBooks reduces what that customer owes you by the
  credit note's amount — reversing that part of the sale without ever
  touching or deleting the original invoice.
---

# Issue a Credit Note in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
