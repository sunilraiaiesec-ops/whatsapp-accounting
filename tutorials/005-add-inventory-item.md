---
tutorial_id: add-inventory-item
title: "Add an Inventory Item in BantooBooks"
feature_area: "Inventory"
audience: "Shop owners and distributors who track stock"
goal: "Add a new product to your inventory so you can sell it, track its stock level, and get warned when it's running low."
prerequisites:
  - "A BantooBooks account with access to an organization (e.g. logged in as central.demo@bantoobooks.com)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  code: "PC-NIDO900"
  name: "Nestlé NIDO Full Cream Milk Powder 900g x12"
  salePrice: "9,900"
  barcode: ""
  unit: "carton"
  reorderLevel: "10"
  defaultTaxRate: "19.25"
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "Inventory" category pill, or open "Inventory items" from the sidebar.'
  - step: 2
    action: 'On the Inventory items page, in the "Add item" form, type "PC-NIDO900" into the "Code" field.'
  - step: 3
    action: 'Type "Nestlé NIDO Full Cream Milk Powder 900g x12" into the "Name" field.'
  - step: 4
    action: 'Type "9,900" into the "Sale price (XAF)" field.'
  - step: 5
    action: 'Leave "Barcode" blank — it is optional and can be added later.'
  - step: 6
    action: 'Type "carton" into the "Unit" field.'
  - step: 7
    action: 'Type "10" into the "Reorder level" field — this is the stock level at which BantooBooks will warn you to restock.'
  - step: 8
    action: 'Type "19.25" into the "Tax %" field.'
  - step: 9
    action: 'Click "Add item".'
  - step: 10
    action: 'Confirm the new item "Nestlé NIDO Full Cream Milk Powder 900g x12" now appears in the item list below, with 0 units "On hand", and the "Items" stat card count has gone up by 1.'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard, showing the category pills row, then the Inventory items page (/inventory-items) after navigating there."
  - step: 2
    screen: "The Inventory items page: stat cards at the top, then the 'Add item' form, then the item list below it."
  - step: 3
    screen: "The 'Add item' form, Name field."
  - step: 4
    screen: "The 'Add item' form, 'Sale price (XAF)' field."
  - step: 5
    screen: "The 'Add item' form, Barcode field, left empty."
  - step: 6
    screen: "The 'Add item' form, Unit field."
  - step: 7
    screen: "The 'Add item' form, Reorder level field."
  - step: 8
    screen: "The 'Add item' form, Tax % field."
  - step: 9
    screen: "The 'Add item' form with the 'Add item' button, briefly showing an 'Adding…' state."
  - step: 10
    screen: "The Inventory items page again, now with the new row at the bottom (or wherever it sorts) of the list and the updated 'Items' stat card."
voiceover_script:
  - step: 1
    line: "To add a new product to your stock, open Inventory items — either from the dashboard or the sidebar."
  - step: 2
    line: "Give the item a short code — this is like its SKU, so you can find it quickly later."
  - step: 3
    line: "Now type the product's full name."
  - step: 4
    line: "Set the price you sell it for. This gets used automatically whenever you add this item to an invoice."
  - step: 5
    line: "If the product has a barcode, you can add it — but it's fine to skip this for now."
  - step: 6
    line: "Tell BantooBooks how this product is sold — by carton, by case, by kilo, whatever fits."
  - step: 7
    line: "This is an important one: the reorder level. Set the stock number that should trigger a 'time to restock' warning — here, we'll say 10."
  - step: 8
    line: "Add the tax rate that applies to this product, if any."
  - step: 9
    line: "Tap 'Add item' to save it."
  - step: 10
    line: "And there it is — your new product is in your inventory, starting at zero units on hand. Once you receive stock for it, BantooBooks will track the quantity and value automatically, and warn you here on this page whenever it drops to or below your reorder level."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Inventory' category pill or the sidebar 'Inventory items' link."
  - step: 2
    highlight: "Highlight the Code input."
  - step: 3
    highlight: "Highlight the Name input."
  - step: 4
    highlight: "Highlight the Sale price input."
  - step: 5
    highlight: "Point at the Barcode input to show it's optional (placeholder text reads 'Optional')."
  - step: 6
    highlight: "Highlight the Unit input."
  - step: 7
    highlight: "Zoom on the Reorder level input — call out why this number matters."
  - step: 8
    highlight: "Highlight the Tax % input."
  - step: 9
    highlight: "Zoom on the 'Add item' button on click."
  - step: 10
    highlight: "Circle the new row in the list, its '0' On hand value, and the 'Items' stat card number."
expected_result: "The new item 'Nestlé NIDO Full Cream Milk Powder 900g x12' (code PC-NIDO900) appears in the Inventory items list with a sale price of 9,900 XAF, unit 'carton', 0 units on hand, and reorder level 10. The 'Items' stat card count increases by 1."
short_youtube_title: "How to Add an Inventory Item in BantooBooks"
youtube_description: |
  Learn how to add a new product to your BantooBooks inventory — set its
  code, sale price, unit, tax rate, and a reorder level so you get warned
  before you run out of stock. Great for shop owners and distributors
  managing physical goods.

  What you'll learn:
  - Which inventory fields are required vs optional
  - Why the reorder level field matters for restocking
  - Where the new item shows up once saved
help_center_article: |
  ## Why add inventory items?

  Adding a product as an inventory item lets BantooBooks track exactly how
  many units you have, what they're worth, and when you're running low —
  instead of you having to remember it yourself. Once an item exists, you can
  pick it directly from the line-item list when creating a sales invoice or
  receiving stock from a supplier.

  ## Steps

  Open "Inventory items" from the sidebar (or the "Inventory" pill on your
  dashboard). In the "Add item" form near the top of the page, type a short
  Code for the product (like a SKU — this just needs to be unique and easy
  for you to recognize) and its Name. Add a Sale price so BantooBooks can
  auto-fill it whenever you add this item to an invoice.

  Barcode is optional — leave it blank if you don't have one yet. Set the
  Unit the product is sold in (carton, case, kg, bag — whatever matches how
  you actually sell it), and a Reorder level: the stock quantity at which
  BantooBooks should flag the item as low. Add a Tax % if one applies.

  Click "Add item" to save. The item starts at 0 units on hand — you'll add
  real stock the next time you receive goods from a supplier.

  ## Tip

  Keep an eye on the "Below reorder level" stat card on this same page (and
  the low-stock alert banner on your dashboard) — that's how BantooBooks
  reminds you it's time to buy more of something before you sell out.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com so the item list
  already has ~100 rows, making the "count went up by 1" moment and the "0 on
  hand for the new item vs stocked levels for existing items" contrast clear.
  Blur/avoid: nothing sensitive on this page; no need to blur anything.
  Pacing: pause briefly on the Reorder level field — call out that this is
  the field that powers the low-stock alert on the dashboard, since it's easy
  to skip past as "just another number."
  Click precision: the "Add item" form is a single-row flex-wrap layout with
  several narrow inputs side by side (Code, Name, Sale price, Barcode, Unit,
  Reorder level, Tax %) — on a normal browser width some may wrap to a second
  line; click carefully inside each labeled input, not the label text.
synthesia_script: |
  Adding a new product to your BantooBooks inventory only takes a moment.

  Open Inventory items, and use the form near the top of the page.

  Give the product a short code, so you can find it quickly later, then type
  its full name.

  Set the price you sell it for — BantooBooks will use this automatically
  whenever you add the item to a future invoice.

  A barcode is optional, so feel free to skip it for now. Choose the unit the
  product is sold in — carton, case, kilo, whatever matches how you actually
  sell it.

  Here's an important one: set a reorder level. This is the stock number that
  tells BantooBooks when to warn you it's time to restock.

  Add a tax rate if one applies, then save.

  Your new product is now in your inventory, starting at zero units on hand.
  As soon as you receive stock, BantooBooks tracks the quantity for you — and
  lets you know the moment it's running low.
---

# Add an Inventory Item in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
