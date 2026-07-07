---
tutorial_id: record-a-goods-receipt
title: "Record a Goods Receipt in BantooBooks"
feature_area: "Inventory"
audience: "Shop owners, distributors, and warehouse staff who restock inventory"
goal: "Record stock received from a supplier so BantooBooks increases your inventory levels and tracks what you owe them."
prerequisites:
  - "At least one supplier already exists (see 'Create a Supplier in BantooBooks')."
  - "At least one inventory item already exists (see 'Add an Inventory Item in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  supplier: "Cameroon Beverages Wholesale SARL"
  date: "2026-07-06"
  reference: "BL-77029"
  item: "Coca-Cola 33cl x24"
  quantity: "50"
  unitCost: "4,200"
  notes: "Monthly restock delivery."
  receiptTotal: "210,000 XAF"
step_by_step_actions:
  - step: 1
    action: 'Open "Goods Receipts" from the sidebar.'
  - step: 2
    action: 'Click "New goods receipt".'
  - step: 3
    action: 'On the New Goods Receipt page, open the "Supplier" dropdown and select "Cameroon Beverages Wholesale SARL".'
  - step: 4
    action: 'Confirm "Date" already shows today''s date.'
  - step: 5
    action: 'Type "BL-77029" into "Reference (optional)".'
  - step: 6
    action: 'In the line-items table, open the "Item" dropdown and select "Coca-Cola 33cl x24".'
  - step: 7
    action: 'Type "50" into "Qty".'
  - step: 8
    action: 'Type "4,200" into "Unit cost".'
  - step: 9
    action: 'Type "Monthly restock delivery." into "Notes (optional)".'
  - step: 10
    action: 'Check the total shown at the bottom right of the table shows "210,000".'
  - step: 11
    action: 'Click "Receive goods".'
  - step: 12
    action: 'Confirm the new goods receipt appears at the top of the Goods Receipts list, then open the Inventory items page and confirm the "On hand" quantity for Coca-Cola 33cl x24 has gone up by 50.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Goods Receipts' link visible."
  - step: 2
    screen: "The Goods Receipts page (/goods-receipts), stat cards and list; the pointer clicking 'New goods receipt' in the page header."
  - step: 3
    screen: "The New Goods Receipt page (/goods-receipts/new), Supplier dropdown open."
  - step: 4
    screen: "The Date field."
  - step: 5
    screen: "The Reference (optional) field."
  - step: 6
    screen: "The line-items table, Item dropdown open."
  - step: 7
    screen: "The line-items table, Qty cell."
  - step: 8
    screen: "The line-items table, Unit cost cell."
  - step: 9
    screen: "The Notes (optional) textarea below the table."
  - step: 10
    screen: "The totals row at the bottom right of the line-items table."
  - step: 11
    screen: "The bottom of the form, with the 'Receive goods' button."
  - step: 12
    screen: "The Goods Receipts list showing the new row, then the Inventory items page showing the updated 'On hand' quantity for Coca-Cola 33cl x24."
voiceover_script:
  - step: 1
    line: "When stock physically arrives from a supplier, record it here as a goods receipt. Open Goods Receipts from the sidebar."
  - step: 2
    line: "Tap 'New goods receipt'."
  - step: 3
    line: "Choose which supplier delivered the stock."
  - step: 4
    line: "The date defaults to today, which is usually correct."
  - step: 5
    line: "If the supplier gave you a delivery note number, add it here — it's optional but useful for matching against their paperwork."
  - step: 6
    line: "Pick the product that was delivered."
  - step: 7
    line: "Enter how many units you received — here, 50 cases."
  - step: 8
    line: "And what you paid per unit."
  - step: 9
    line: "Add a note if it's useful for your records."
  - step: 10
    line: "Check the total value of this delivery before saving."
  - step: 11
    line: "Tap 'Receive goods'."
  - step: 12
    line: "And that's it — your stock count goes up immediately, and the amount you owe this supplier increases by the same value."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Goods Receipts' sidebar link."
  - step: 2
    highlight: "Circle the 'New goods receipt' button."
  - step: 3
    highlight: "Zoom on the Supplier dropdown and the selected name."
  - step: 4
    highlight: "Highlight the Date field."
  - step: 5
    highlight: "Highlight the Reference field."
  - step: 6
    highlight: "Zoom on the Item dropdown and the selected product."
  - step: 7
    highlight: "Highlight the Qty cell as it changes to 50."
  - step: 8
    highlight: "Highlight the Unit cost cell."
  - step: 9
    highlight: "Highlight the Notes textarea."
  - step: 10
    highlight: "Box the total figure at the bottom right of the table."
  - step: 11
    highlight: "Zoom on the 'Receive goods' button on click."
  - step: 12
    highlight: "Circle the new row in the Goods Receipts list, then circle the updated 'On hand' number on the Inventory items page."
expected_result: "A new goods receipt for 210,000 XAF from 'Cameroon Beverages Wholesale SARL' appears at the top of the Goods Receipts list. The 'On hand' quantity for Coca-Cola 33cl x24 on the Inventory items page increases by 50, and the amount owed to this supplier (Accounts Payable) increases by 210,000 XAF."
short_youtube_title: "How to Record a Goods Receipt in BantooBooks"
youtube_description: |
  Learn how to record stock received from a supplier in BantooBooks — a
  goods receipt increases your inventory levels and tracks what you owe,
  all in one step. Essential for distributors restocking regularly.

  What you'll learn:
  - Where to find "New goods receipt" in BantooBooks
  - How receiving stock updates both inventory and what you owe
  - Why the unit cost you enter here matters for your inventory value
help_center_article: |
  ## Why record a goods receipt?

  When stock physically arrives from a supplier, recording it as a goods
  receipt does two things at once: it increases the quantity on hand for
  that item, and it adds the value to your Accounts Payable — money you
  owe that supplier — using the same double-entry logic as an invoice, but
  built specifically around receiving inventory.

  ## Steps

  Open "Goods Receipts" from the sidebar and click "New goods receipt".
  Choose the Supplier, confirm the Date, and optionally add their delivery
  note number as a Reference. In the line-items table, pick the Item that
  was delivered, and enter the Qty received and the Unit cost you paid for
  it. Add Notes if useful, then click "Receive goods".

  ## Tip

  The Unit cost you enter here feeds BantooBooks' weighted-average cost for
  that item — used later to calculate cost of goods sold and your
  inventory's value on the Inventory Valuation report, so it's worth taking
  a moment to get it right.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com; recording after
  "Add an inventory item" (or with an existing catalog item like Coca-Cola
  33cl x24) makes the Item dropdown feel natural.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause on the final step showing the Inventory items page — the
  "On hand" number visibly increasing is the payoff moment of this tutorial.
  Click precision: this form has no tax field, unlike a purchase invoice or
  sales invoice — don't look for one; goods receipts only track quantity and
  unit cost.
synthesia_script: |
  When new stock physically arrives from a supplier, that's a goods
  receipt in BantooBooks — and it does two things at once.

  Start a new goods receipt, and choose which supplier delivered the stock.

  If they gave you a delivery note number, you can add it as a reference.

  Then pick the product that arrived, and enter how many units you
  received, and what you paid per unit.

  Save it, and BantooBooks immediately increases your stock count for that
  item, and adds the value to what you owe that supplier — both updated in
  a single step.
---

# Record a Goods Receipt in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
