---
tutorial_id: edit-a-sales-invoice
title: "Edit a Sales Invoice in BantooBooks"
feature_area: "Sales & Invoicing"
audience: "Shop owners, distributors, and bookkeepers who need to fix a mistake on an invoice"
goal: "Correct a mistake on an existing sales invoice — like a wrong quantity — after it's already been saved."
prerequisites:
  - "At least one sales invoice already exists (see 'Create a Sales Invoice in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Alimentation Baobab Douala"
  reference: "PO-2031"
  correctedQuantity: "6"
  correctedNote: "Corrected quantity — customer actually received 6 cases, not 5."
  newTotal: "37,206 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Sales Invoices" from the sidebar.'
  - step: 2
    action: 'Click the invoice number for the row showing customer "Alimentation Baobab Douala" and reference "PO-2031" to open it.'
  - step: 3
    action: 'On the invoice page, click "Edit".'
  - step: 4
    action: 'In the "Line items" table, change "Qty" from "5" to "6" for the Coca-Cola line.'
  - step: 5
    action: 'Confirm the invoice total at the bottom right updates from "31,005" to "37,206".'
  - step: 6
    action: 'Add "Corrected quantity — customer actually received 6 cases, not 5." to the end of the "Notes (optional)" text.'
  - step: 7
    action: 'Click "Save changes".'
  - step: 8
    action: 'Confirm you land back on the invoice page, now showing quantity "6" and a total of "37,206 XAF".'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Sales Invoices' link visible."
  - step: 2
    screen: "The Sales Invoices list page (/sales-invoices), with the pointer clicking the invoice number link for the matching row."
  - step: 3
    screen: "The invoice detail page (/sales-invoices/{id}), with the toolbar at the top showing '← Sales Invoices', 'Edit', 'Clone', 'Print', and 'PDF' buttons; the pointer clicking 'Edit'."
  - step: 4
    screen: "The Edit invoice page (/sales-invoices/{id}/edit), Line items table, Qty cell for the Coca-Cola row."
  - step: 5
    screen: "The totals block on the right of the Line items card, showing the updated Invoice total."
  - step: 6
    screen: "The Notes textarea near the bottom of the form."
  - step: 7
    screen: "The bottom action bar with the 'Save changes' button."
  - step: 8
    screen: "The invoice detail page again, showing the updated line and total."
voiceover_script:
  - step: 1
    line: "Mistakes happen — maybe a quantity was wrong, or a price needs updating. Let's fix an existing invoice. Open Sales Invoices from the sidebar."
  - step: 2
    line: "Find the invoice for 'Alimentation Baobab Douala' with reference 'PO-2031', and open it."
  - step: 3
    line: "Tap 'Edit' at the top of the invoice."
  - step: 4
    line: "This opens the same form you used to create it, already filled in. Let's fix the quantity — turns out the customer actually received 6 cases, not 5."
  - step: 5
    line: "BantooBooks recalculates the total automatically, including tax."
  - step: 6
    line: "It's good practice to leave a short note explaining what changed and why."
  - step: 7
    line: "Tap 'Save changes'."
  - step: 8
    line: "And you're back on the invoice, now showing the correct quantity and total — no need to delete anything or start over."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Sales Invoices' sidebar link."
  - step: 2
    highlight: "Circle the matching invoice's number link in the list."
  - step: 3
    highlight: "Circle the 'Edit' button in the toolbar."
  - step: 4
    highlight: "Highlight the Qty cell as it changes from 5 to 6."
  - step: 5
    highlight: "Box the updated Invoice total figure."
  - step: 6
    highlight: "Highlight the Notes textarea as text is added."
  - step: 7
    highlight: "Zoom on the 'Save changes' button on click."
  - step: 8
    highlight: "Circle the updated Qty and Total on the invoice page."
expected_result: "The invoice for 'Alimentation Baobab Douala' (reference PO-2031) now shows a quantity of 6 for the Coca-Cola line and a total of 37,206 XAF, up from the original 31,005 XAF. The customer's balance on the Customers page increases by the difference (6,201 XAF)."
short_youtube_title: "How to Edit a Sales Invoice in BantooBooks"
youtube_description: |
  Made a mistake on a sales invoice? See how to open it and fix it directly
  in BantooBooks — no need to delete anything or start over from scratch.

  What you'll learn:
  - How to open an existing invoice for editing
  - How BantooBooks recalculates totals automatically after a change
  - Why leaving a note about the correction is good practice
help_center_article: |
  ## Why edit a sales invoice?

  If you catch a mistake on an invoice — the wrong quantity, an incorrect
  price, a missing due date — you don't need to delete it and start again.
  BantooBooks lets you open any existing invoice and update it directly,
  and it recalculates the total (including tax) for you automatically.

  ## Steps

  Open "Sales Invoices" from the sidebar and click the invoice you need to
  fix from the list. On the invoice page, click "Edit" — this reopens the
  same form used to create the invoice, pre-filled with its current details.
  Make your changes in the Line items table, Customer, dates, or Notes as
  needed, and check the recalculated total looks right. Click "Save
  changes" to update the invoice.

  ## Tip

  It's good practice to add a short line to the Notes field explaining what
  you corrected and why — this creates a small paper trail if you or a
  colleague looks at the invoice again later.
guidde_recording_notes: |
  Zoom level: 100%. Record this right after "Create a sales invoice" so the
  same invoice (reference PO-2031) is available to edit, and the before/after
  total change (31,005 → 37,206 XAF) is meaningful on screen.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause on the moment the total recalculates after changing the
  quantity — this is the key "aha" moment of the tutorial.
  Click precision: the "Edit" button lives in the toolbar at the top of the
  invoice's view page, next to "Clone", "Print", and "PDF" — don't confuse
  it with the browser's own back/forward controls.
synthesia_script: |
  Mistakes on an invoice happen — the wrong quantity, an incorrect price, a
  missing due date. The good news is you don't need to delete an invoice
  and start over to fix one.

  Open the invoice from your Sales Invoices list, and choose Edit.

  This brings up the exact same form you used to create it, already filled
  in with its current details. Make whatever correction you need — say, a
  quantity that should have been six cases instead of five.

  BantooBooks recalculates the total for you automatically, including tax.

  It's worth adding a short note explaining what changed, for your own
  records.

  Save your changes, and the invoice is updated — same invoice, same
  number, just corrected.
---

# Edit a Sales Invoice in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
