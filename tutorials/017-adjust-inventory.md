---
tutorial_id: adjust-inventory
title: "Adjust Inventory in BantooBooks"
feature_area: "Inventory"
audience: "Shop owners, distributors, and warehouse staff correcting stock counts"
goal: "Correct an item's stock quantity after a physical count, so BantooBooks matches what's actually on your shelves."
prerequisites:
  - "At least one inventory item already exists (see 'Add an Inventory Item in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  adjustmentAccount: "4900 — Other income"
  date: "2026-07-06"
  item: "Nestlé NIDO Full Cream Milk Powder 900g x12"
  onHand: "0"
  newQuantity: "2"
  notes: "Physical stock count on 6 July — found 2 cartons of NIDO that were never logged as received."
step_by_step_actions:
  - step: 1
    action: 'Open "Inventory Items" from the sidebar, then click the "Adjustments" link, or open "Inventory Adjustments" directly.'
  - step: 2
    action: 'Click "New adjustment" (or navigate to /inventory-adjustments/new).'
  - step: 3
    action: 'On the New Inventory Quantity Adjustment page, open the "Adjustment account (gain / loss)" dropdown and select "4900 — Other income".'
  - step: 4
    action: 'Confirm "Date" already shows today''s date.'
  - step: 5
    action: 'In the table, open the "Item" dropdown and select "Nestlé NIDO Full Cream Milk Powder 900g x12". Note the "On hand" column shows "0".'
  - step: 6
    action: 'Type "2" into the "New qty" cell for that row.'
  - step: 7
    action: 'Confirm the "Change" column now shows "+2".'
  - step: 8
    action: 'Type "Physical stock count on 6 July — found 2 cartons of NIDO that were never logged as received." into "Reason / notes (optional)".'
  - step: 9
    action: 'Click "Save adjustment".'
  - step: 10
    action: 'Confirm the new adjustment appears at the top of the Inventory Adjustments list, then open Inventory Items and confirm "On hand" for Nestlé NIDO Full Cream Milk Powder 900g x12 now shows "2".'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Inventory' section expanded showing 'Inventory Items' and 'Adjustments' links."
  - step: 2
    screen: "The Inventory Adjustments page (/inventory-adjustments), list of past adjustments; the pointer clicking to start a new one."
  - step: 3
    screen: "The New Inventory Quantity Adjustment page (/inventory-adjustments/new), 'Adjustment account (gain / loss)' dropdown open."
  - step: 4
    screen: "The Date field."
  - step: 5
    screen: "The adjustment table, Item dropdown open, with the 'On hand' column visible showing 0."
  - step: 6
    screen: "The adjustment table, 'New qty' cell for the NIDO row."
  - step: 7
    screen: "The adjustment table, 'Change' column showing +2."
  - step: 8
    screen: "The 'Reason / notes (optional)' textarea below the table."
  - step: 9
    screen: "The bottom of the form, with the 'Save adjustment' button."
  - step: 10
    screen: "The Inventory Adjustments list showing the new row, then the Inventory Items page showing the updated On hand value for NIDO."
voiceover_script:
  - step: 1
    line: "Sometimes what's on your shelves doesn't match what BantooBooks shows — maybe stock arrived without being logged, or went missing. Let's fix that with an inventory adjustment. Open Inventory Items, then Adjustments."
  - step: 2
    line: "Start a new adjustment."
  - step: 3
    line: "Choose an account for the value of the change — since we're adding stock we didn't pay for through a normal purchase, we'll use 'Other income' here."
  - step: 4
    line: "The date defaults to today."
  - step: 5
    line: "Pick the item you're correcting. BantooBooks shows you what it currently thinks you have on hand."
  - step: 6
    line: "Type in the quantity you actually counted — here, we found 2 cartons that were never logged."
  - step: 7
    line: "BantooBooks shows you the change this will make — a plus 2 in this case."
  - step: 8
    line: "Add a short reason. This is really useful later if anyone asks why the stock level changed."
  - step: 9
    line: "Tap 'Save adjustment'."
  - step: 10
    line: "And that's it — your stock count is corrected immediately, and there's a clear record of why."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Inventory Items' and 'Adjustments' sidebar links."
  - step: 2
    highlight: "Circle the control that starts a new adjustment."
  - step: 3
    highlight: "Zoom on the 'Adjustment account' dropdown and selected value."
  - step: 4
    highlight: "Highlight the Date field."
  - step: 5
    highlight: "Zoom on the Item dropdown and the 'On hand' value showing 0."
  - step: 6
    highlight: "Highlight the 'New qty' cell as '2' is typed."
  - step: 7
    highlight: "Box the 'Change' column showing +2."
  - step: 8
    highlight: "Highlight the Reason / notes textarea."
  - step: 9
    highlight: "Zoom on the 'Save adjustment' button on click."
  - step: 10
    highlight: "Circle the new row, then circle the updated On hand value on the Inventory Items page."
expected_result: "The Inventory Items page shows 'On hand' for Nestlé NIDO Full Cream Milk Powder 900g x12 has changed from 0 to 2, and a new adjustment appears at the top of the Inventory Adjustments list referencing the reason typed in."
short_youtube_title: "How to Adjust Inventory in BantooBooks"
youtube_description: |
  Learn how to correct a stock count in BantooBooks after a physical
  inventory count — whether you found extra stock or came up short. See
  exactly how an adjustment updates your quantity and posts the value
  difference to a gain or loss account.

  What you'll learn:
  - Where to find inventory adjustments in BantooBooks
  - How to correct an item's quantity to match a physical count
  - How gains and losses post to your books automatically
help_center_article: |
  ## Why adjust inventory?

  Physical stock counts rarely match your system's records perfectly —
  stock can arrive without being logged, go missing, get damaged, or simply
  get miscounted. An inventory adjustment lets you set an item's quantity
  to whatever you actually counted, and BantooBooks handles the accounting
  for the difference automatically.

  ## Steps

  Open "Inventory Adjustments" (from the Inventory Items page, or directly
  from the sidebar) and start a new adjustment. Choose an "Adjustment
  account (gain / loss)" — this is where the value of any stock you're
  adding or removing gets posted. Confirm the Date, then pick the Item
  you're correcting: BantooBooks shows its current "On hand" quantity next
  to a "New qty" field where you type in what you actually counted. The
  "Change" column shows the difference. Add a short Reason / notes
  explaining why, then click "Save adjustment".

  ## Tip

  You can adjust several items in the same adjustment — click "+ Add line"
  to add another row, useful right after a full physical stock count that
  touched multiple products at once.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com and pick an item
  with a known starting quantity (like a freshly-added item still at 0 on
  hand) so the "before/after" change is unambiguous on screen.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause on the 'Change' column updating live as the New qty is
  typed — this immediate feedback is worth calling out.
  Click precision: the "New qty" input shows the current on-hand value as
  placeholder text (grey, not a real value) — make sure to actually type a
  number rather than leaving it looking "already filled in".
synthesia_script: |
  Physical stock counts rarely match your books perfectly — stock can
  arrive without being logged, go missing, or just get miscounted. That's
  what inventory adjustments are for.

  Start a new adjustment, and choose an account for the value of whatever
  change you're making — a gain or a loss account, depending on the
  situation.

  Pick the item you're correcting. BantooBooks shows you what it currently
  thinks you have, right next to a field for what you actually counted.

  Type in the real quantity, and BantooBooks shows you exactly how much
  that changes things.

  Add a short reason — useful later if anyone asks why the stock level
  moved — then save.

  Your stock count is corrected immediately, with a clear record of why.
---

# Adjust Inventory in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
