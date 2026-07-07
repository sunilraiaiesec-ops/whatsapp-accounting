---
tutorial_id: issue-a-refund-receipt
title: "Issue a Refund Receipt in BantooBooks"
feature_area: "Receipts"
audience: "Shop owners and cashiers who need to refund a customer in cash on the spot"
goal: "Refund a customer for a returned item paid for in cash, so your cash balance and sales are corrected immediately."
prerequisites:
  - "At least one bank or cash account exists (BantooBooks creates a default '1000 — Cash on hand' account for every new organization)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Walk-in / no customer"
  refundFrom: "1000 — Cash on hand"
  date: "2026-07-06"
  reference: "RET-0007"
  item: "Omo Detergent 900g x12"
  description: "Omo Detergent 900g x12 — defective carton returned"
  quantity: "1"
  unitPrice: "18,700"
  taxRate: "19.25"
  incomeAccount: "4000 — Sales"
  totalRefunded: "22,300 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Refund Receipts" from the sidebar.'
  - step: 2
    action: 'Click "New refund".'
  - step: 3
    action: 'On the New Refund Receipt page, leave "Customer (optional)" set to "Walk-in / no customer" since this was a counter sale.'
  - step: 4
    action: 'Open the "Refund from" dropdown and select "1000 — Cash on hand".'
  - step: 5
    action: 'Confirm "Date" already shows today''s date.'
  - step: 6
    action: 'Type "RET-0007" into "Reference (optional)".'
  - step: 7
    action: 'In the "Line items" table, use the "Item" dropdown on the first row to select "Omo Detergent 900g x12" — this auto-fills the Description and Unit price.'
  - step: 8
    action: 'Update the Description to "Omo Detergent 900g x12 — defective carton returned".'
  - step: 9
    action: 'Confirm "Qty" shows "1" and "Tax %" is set to "19.25".'
  - step: 10
    action: 'Check "Total refunded" shows "22,300 XAF".'
  - step: 11
    action: 'Click "Save refund".'
  - step: 12
    action: 'Confirm the new refund appears at the top of the Refund Receipts list, showing "Walk-in" as the customer and "1000 — Cash on hand" as the account paid from.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Refund Receipts' link visible."
  - step: 2
    screen: "The Refund Receipts page (/refund-receipts), stat cards and list; the pointer clicking 'New refund' in the page header."
  - step: 3
    screen: "The New Refund Receipt page (/refund-receipts/new), Customer (optional) dropdown left on 'Walk-in / no customer'."
  - step: 4
    screen: "The 'Refund from' dropdown open."
  - step: 5
    screen: "The Date field."
  - step: 6
    screen: "The Reference (optional) field."
  - step: 7
    screen: "The Line items card, first row, Item dropdown open."
  - step: 8
    screen: "The Line items table, Description cell being edited."
  - step: 9
    screen: "The Line items table, Qty and Tax % cells."
  - step: 10
    screen: "The 'Total refunded' figure at the bottom right of the Line items card."
  - step: 11
    screen: "The bottom action bar with the 'Save refund' button."
  - step: 12
    screen: "The Refund Receipts list page, showing the new row at the top."
voiceover_script:
  - step: 1
    line: "If you need to refund a customer in cash right away — like for a defective product — BantooBooks calls this a refund receipt. Open Refund Receipts from the sidebar."
  - step: 2
    line: "Tap 'New refund'."
  - step: 3
    line: "Since this was a walk-in sale, we can leave the customer as 'Walk-in / no customer'."
  - step: 4
    line: "Choose which account the refund is paid out of — usually your cash drawer for an over-the-counter refund."
  - step: 5
    line: "The date defaults to today."
  - step: 6
    line: "If you're tracking a return or reference number, add it here."
  - step: 7
    line: "Pick what's being returned — BantooBooks fills in the price for you."
  - step: 8
    line: "You can adjust the description to explain why it's being refunded."
  - step: 9
    line: "Double-check the quantity and tax rate match the original sale."
  - step: 10
    line: "Check the total refunded before saving."
  - step: 11
    line: "Tap 'Save refund'."
  - step: 12
    line: "And that's it — the cash goes back out immediately, and your sales figures are corrected to reflect the return."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Refund Receipts' sidebar link."
  - step: 2
    highlight: "Circle the 'New refund' button."
  - step: 3
    highlight: "Highlight the Customer (optional) dropdown showing 'Walk-in / no customer'."
  - step: 4
    highlight: "Zoom on the 'Refund from' dropdown and selected account."
  - step: 5
    highlight: "Highlight the Date field."
  - step: 6
    highlight: "Highlight the Reference field."
  - step: 7
    highlight: "Zoom on the Item dropdown and the auto-filled Description/Unit price after selection."
  - step: 8
    highlight: "Highlight the Description cell as it's edited."
  - step: 9
    highlight: "Highlight the Qty and Tax % cells."
  - step: 10
    highlight: "Box the 'Total refunded' figure."
  - step: 11
    highlight: "Zoom on the 'Save refund' button on click."
  - step: 12
    highlight: "Circle the new row, its 'Walk-in' customer label, and the 'Cash on hand' account column."
expected_result: "A new refund receipt for 22,300 XAF appears at the top of the Refund Receipts list, showing 'Walk-in' as the customer and '1000 — Cash on hand' as the account. The Cash on hand balance decreases by 22,300 XAF and the sales/income figures for the period decrease by the same amount."
short_youtube_title: "How to Issue a Refund Receipt in BantooBooks"
youtube_description: |
  Learn how to refund a customer in cash for a returned item in BantooBooks
  — perfect for shop owners handling a defective product or an on-the-spot
  return, without needing a credit note or invoice.

  What you'll learn:
  - The difference between a refund receipt and a credit note
  - How to refund a walk-in cash sale
  - How a refund updates your cash balance and sales figures immediately
help_center_article: |
  ## Why use a refund receipt instead of a credit note?

  A credit note reduces what a customer owes you on an invoice they haven't
  fully paid yet. A refund receipt is for the opposite, more immediate case:
  you're handing cash (or sending money) straight back to someone, usually
  because they paid on the spot and are now returning the item. Recording
  it as a refund receipt updates your cash balance and sales figures in one
  step.

  ## Steps

  Open "Refund Receipts" from the sidebar and click "New refund". The
  Customer field is optional — leave it as "Walk-in / no customer" if that's
  how the original sale was recorded. Choose which account the refund comes
  out of under "Refund from" (usually your cash account), and confirm the
  Date.

  In the Line items table, pick the returned product from the Item dropdown
  if it's in your inventory — BantooBooks fills in the price. Adjust the
  Description to note why it's being refunded, confirm the Quantity and Tax
  % match the original sale, then click "Save refund".

  ## Tip

  If the item is tracked in your inventory, BantooBooks returns the
  quantity to stock automatically as part of saving the refund.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Record a cash sale" for the same
  walk-in item so the "sale, then refund" story reads naturally.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on step 3 to reinforce that 'Walk-in / no customer'
  is expected here, matching how the original sale was recorded.
  Click precision: the Item dropdown is a plain <select> with every
  inventory item listed by name — scroll carefully to find the right one.
synthesia_script: |
  Sometimes you need to refund a customer in cash right away — for example,
  a defective product returned on the spot. In BantooBooks, that's a
  refund receipt.

  Start a new refund. If the original sale was a walk-in with no customer
  attached, you can leave it that way here too.

  Choose which account the refund comes out of — usually your cash account
  — and confirm the date.

  Pick what's being returned, and BantooBooks fills in the price for you.
  You can adjust the description to note why it's being refunded.

  Save it, and the cash goes back out immediately, while your sales
  figures are corrected to reflect the return — no credit note or invoice
  needed.
---

# Issue a Refund Receipt in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
