---
tutorial_id: write-off-inventory
title: "Write Off Damaged or Expired Inventory in BantooBooks"
feature_area: "Inventory"
audience: "Shop owners, distributors, and warehouse staff removing damaged or expired stock"
goal: "Remove damaged, lost, or expired stock from inventory and book the loss to an expense account."
prerequisites:
  - "At least one inventory item with stock on hand (see 'Record a Goods Receipt in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  expenseAccount: "6000 — General expenses"
  date: "2026-07-06"
  item: "Coca-Cola 33cl x24"
  writeOffQty: "3"
  notes: "3 cases damaged in the stockroom during the July delivery — crushed on the bottom shelf."
step_by_step_actions:
  - step: 1
    action: 'Open "Inventory Write-offs" from the sidebar.'
  - step: 2
    action: 'Click "New write-off".'
  - step: 3
    action: 'On the New Inventory Write-off page, open the "Write-off expense account" dropdown and select "6000 — General expenses".'
  - step: 4
    action: 'Confirm "Date" already shows today''s date.'
  - step: 5
    action: 'In the table, open the "Item" dropdown and select "Coca-Cola 33cl x24".'
  - step: 6
    action: 'Type "3" into the "Write off qty" cell for that row.'
  - step: 7
    action: 'Type "3 cases damaged in the stockroom during the July delivery — crushed on the bottom shelf." into "Reason / notes (optional)".'
  - step: 8
    action: 'Click "Write off".'
  - step: 9
    action: 'Confirm the new write-off appears at the top of the Inventory Write-offs list, then open Inventory Items and confirm the "On hand" quantity for Coca-Cola 33cl x24 has gone down by 3.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Inventory Write-offs' link visible."
  - step: 2
    screen: "The Inventory write-offs page (/inventory-write-offs), stat cards and list; the pointer clicking 'New write-off' in the page header."
  - step: 3
    screen: "The New Inventory Write-off page (/inventory-write-offs/new), 'Write-off expense account' dropdown open."
  - step: 4
    screen: "The Date field."
  - step: 5
    screen: "The write-off table, Item dropdown open, with the 'On hand' column visible."
  - step: 6
    screen: "The write-off table, 'Write off qty' cell for the Coca-Cola row."
  - step: 7
    screen: "The 'Reason / notes (optional)' textarea below the table."
  - step: 8
    screen: "The bottom of the form, with the 'Write off' button."
  - step: 9
    screen: "The Inventory Write-offs list showing the new row, then the Inventory Items page showing the reduced On hand value for Coca-Cola 33cl x24."
voiceover_script:
  - step: 1
    line: "When stock is damaged, lost, or expires before you can sell it, you need to remove it from your books cleanly — that's an inventory write-off. Open Inventory Write-offs from the sidebar."
  - step: 2
    line: "Tap 'New write-off'."
  - step: 3
    line: "Choose the expense account this loss should post to."
  - step: 4
    line: "The date defaults to today."
  - step: 5
    line: "Pick the item that was damaged or lost — only items with stock on hand show up here."
  - step: 6
    line: "Enter how many units to remove — three cases in this example."
  - step: 7
    line: "Add a short reason, so there's a clear record of what happened and why."
  - step: 8
    line: "Tap 'Write off'."
  - step: 9
    line: "And that's it — the stock is removed at its average cost, the loss is booked as an expense, and your inventory value stays accurate."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Inventory Write-offs' sidebar link."
  - step: 2
    highlight: "Circle the 'New write-off' button."
  - step: 3
    highlight: "Zoom on the 'Write-off expense account' dropdown and selected value."
  - step: 4
    highlight: "Highlight the Date field."
  - step: 5
    highlight: "Zoom on the Item dropdown and the 'On hand' value shown."
  - step: 6
    highlight: "Highlight the 'Write off qty' cell as '3' is typed."
  - step: 7
    highlight: "Highlight the Reason / notes textarea."
  - step: 8
    highlight: "Zoom on the 'Write off' button on click."
  - step: 9
    highlight: "Circle the new row, then circle the reduced On hand value on the Inventory Items page."
expected_result: "The Inventory Items page shows the 'On hand' quantity for Coca-Cola 33cl x24 has decreased by 3, and a new write-off appears at the top of the Inventory Write-offs list with its value booked to '6000 — General expenses'."
short_youtube_title: "How to Write Off Damaged Inventory in BantooBooks"
youtube_description: |
  Learn how to remove damaged, lost, or expired stock from your inventory
  in BantooBooks and book the loss correctly as an expense — keeping your
  stock counts and financial reports accurate.

  What you'll learn:
  - Where to find inventory write-offs in BantooBooks
  - How to remove damaged or expired stock cleanly
  - How the loss posts to your expense accounts automatically
help_center_article: |
  ## Why write off inventory?

  Stock doesn't always make it to a sale — it can be damaged in storage,
  expire, or simply go missing. Leaving it in your on-hand count would
  overstate your inventory's value on your Balance Sheet. A write-off
  removes it cleanly and records the loss as a business expense.

  ## Steps

  Open "Inventory Write-offs" from the sidebar and click "New write-off".
  Choose the "Write-off expense account" this loss should post to, and
  confirm the Date. In the table, pick the Item you're writing off — only
  items with stock currently on hand appear in the list — and enter the
  "Write off qty". Add a short Reason / notes describing what happened,
  then click "Write off".

  ## Tip

  BantooBooks removes the stock at its current average cost, so the
  expense you see reflects what you actually paid for that stock, not a
  guess — Dr expense / Cr Inventory on hand.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Record a goods receipt" for the
  same item so there's visible stock on hand to write off — items with
  zero stock don't appear in the Item dropdown at all.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause on the final step showing the reduced 'On hand' figure on
  the Inventory Items page — that's the payoff moment.
  Click precision: the Item dropdown only lists items with qty > 0 — if a
  freshly-added item isn't showing up, that's expected, not a bug.
synthesia_script: |
  Stock doesn't always make it to a sale — it can get damaged in storage,
  expire, or go missing. When that happens, you need to remove it from
  your books cleanly. That's what an inventory write-off is for.

  Start a new write-off, and choose the expense account this loss should
  post to.

  Pick the item that was damaged or lost — only items you actually have in
  stock show up here — and enter how many units to remove.

  Add a short reason, so there's a clear record of what happened.

  Save it, and BantooBooks removes the stock at its average cost and books
  the loss as an expense — keeping your numbers accurate without any
  manual journal entries.
---

# Write Off Damaged or Expired Inventory in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
