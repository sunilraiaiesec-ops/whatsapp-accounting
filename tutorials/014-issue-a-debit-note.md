---
tutorial_id: issue-a-debit-note
title: "Issue a Debit Note in BantooBooks"
feature_area: "Purchasing"
audience: "Shop owners, distributors, and bookkeepers correcting a bill from a supplier"
goal: "Issue a debit note to reduce what you owe a supplier after a billing dispute or a purchase return, without editing the original bill."
prerequisites:
  - "At least one supplier with a previous purchase invoice already exists (see 'Create a Purchase Invoice in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  supplier: "SOCATRAF Transport SARL"
  supplierRef: "FAC-4471"
  date: "2026-07-06"
  description: "Credit for 1 cancelled delivery run — Yaoundé depot, July"
  quantity: "1"
  unitPrice: "45,000"
  taxRate: "19.25"
  expenseAccount: "6300 — Transport & fuel"
  notes: "Delivery run cancelled due to vehicle breakdown; supplier agreed to credit this amount."
  debitNoteTotal: "53,663 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Debit Notes" from the sidebar.'
  - step: 2
    action: 'Click "New debit note".'
  - step: 3
    action: 'On the New Debit Note page, open the "Supplier" dropdown and select "SOCATRAF Transport SARL".'
  - step: 4
    action: 'Type "FAC-4471" into "Supplier''s reference (optional)".'
  - step: 5
    action: 'Confirm "Date" already shows today''s date.'
  - step: 6
    action: 'In the line-items table, type "Credit for 1 cancelled delivery run — Yaoundé depot, July" into the "Description" cell.'
  - step: 7
    action: 'Confirm "Qty" already shows "1", then type "45,000" into "Unit price".'
  - step: 8
    action: 'Type "19.25" into "Tax %".'
  - step: 9
    action: 'Open the "Expense / asset account" dropdown and select "6300 — Transport & fuel".'
  - step: 10
    action: 'Type "Delivery run cancelled due to vehicle breakdown; supplier agreed to credit this amount." into "Notes (optional)".'
  - step: 11
    action: 'Check the total shown at the bottom right of the table shows "53,663".'
  - step: 12
    action: 'Click "Save debit note".'
  - step: 13
    action: 'Confirm the new debit note appears at the top of the Debit Notes list, referencing "FAC-4471".'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Debit Notes' link visible."
  - step: 2
    screen: "The Debit Notes page (/debit-notes), stat cards and list; the pointer clicking 'New debit note' in the page header."
  - step: 3
    screen: "The New Debit Note page (/debit-notes/new), Supplier dropdown open."
  - step: 4
    screen: "The 'Supplier's reference (optional)' field."
  - step: 5
    screen: "The Date field."
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
    screen: "The bottom of the form, with the 'Save debit note' button."
  - step: 13
    screen: "The Debit Notes list page, showing the new row at the top."
voiceover_script:
  - step: 1
    line: "Sometimes a supplier overcharges you, or agrees to credit you for something — like a cancelled delivery. BantooBooks calls this a debit note. Open Debit Notes from the sidebar."
  - step: 2
    line: "Tap 'New debit note'."
  - step: 3
    line: "Choose which supplier this relates to."
  - step: 4
    line: "If it relates to a specific bill, reference it here — we'll use the same invoice number as the original transport bill."
  - step: 5
    line: "The date defaults to today."
  - step: 6
    line: "Describe what's being credited."
  - step: 7
    line: "Set the quantity and the amount being credited back."
  - step: 8
    line: "Add the same tax rate that applied to the original bill."
  - step: 9
    line: "Choose the same expense account the original bill used, so the reversal lines up correctly."
  - step: 10
    line: "Add a note explaining why — handy for you and for the supplier's records."
  - step: 11
    line: "Check the total before saving."
  - step: 12
    line: "Tap 'Save debit note'."
  - step: 13
    line: "And that's it — this reduces what you owe that supplier, without ever touching the original bill."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Debit Notes' sidebar link."
  - step: 2
    highlight: "Circle the 'New debit note' button."
  - step: 3
    highlight: "Zoom on the Supplier dropdown and the selected name."
  - step: 4
    highlight: "Highlight the Supplier's reference field."
  - step: 5
    highlight: "Highlight the Date field."
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
    highlight: "Zoom on the 'Save debit note' button on click."
  - step: 13
    highlight: "Circle the new row at the top of the Debit Notes list."
expected_result: "A new debit note for 53,663 XAF against 'SOCATRAF Transport SARL' is created and appears at the top of the Debit Notes list, referencing 'FAC-4471'. The amount you owe this supplier (Accounts Payable) decreases by the same amount."
short_youtube_title: "How to Issue a Debit Note in BantooBooks"
youtube_description: |
  Learn how to issue a debit note in BantooBooks when a supplier owes you a
  credit — whether from a billing dispute, an overcharge, or a cancelled
  order — without editing or deleting the original bill.

  What you'll learn:
  - Where to find "New debit note" in BantooBooks
  - How to reference the original supplier bill
  - How a debit note reduces what you owe a supplier
help_center_article: |
  ## Why issue a debit note?

  A debit note reduces what you owe a supplier — typically because they
  agreed to credit you for a billing mistake, a cancelled order, or
  returned goods. Instead of editing the original purchase invoice (which
  should stay as an accurate record), you issue a separate debit note that
  reverses part of the expense and reduces your Accounts Payable balance
  for that supplier.

  ## Steps

  Open "Debit Notes" from the sidebar and click "New debit note". Choose
  the Supplier, and optionally reference the original bill number so it's
  easy to trace later. Confirm the Date, then describe what's being
  credited in the line-items table — set the Quantity, Unit price, and Tax
  % to match the original bill, and choose the same Expense / asset
  account it used. Add Notes if useful, then click "Save debit note".

  ## Tip

  Keep the wording in Description and Notes specific (what happened, and
  why the supplier agreed to the credit) — this is often the only written
  record of the dispute once it's resolved.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Create a purchase invoice" for the
  same supplier/reference so the "bill, then partial credit" story reads
  naturally.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on step 9 (Expense / asset account) — call out that
  it should match the original bill's account.
  Click precision: this form looks nearly identical to the New Purchase
  Invoice form — make sure the recording clearly shows the page title
  "New Debit Note" so viewers don't confuse the two.
synthesia_script: |
  Sometimes a supplier agrees to credit you for something — a billing
  mistake, a cancelled order, or returned goods. In BantooBooks, that's
  called a debit note.

  Start a new debit note, and choose which supplier it's for.

  If it relates to a specific bill, you can reference that bill number so
  it's easy to trace later.

  Describe what's being credited, and match the quantity, price, tax, and
  expense account to the original bill.

  Save it, and BantooBooks reduces what you owe that supplier by the debit
  note's amount — without ever touching or deleting the original bill.
---

# Issue a Debit Note in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
