---
tutorial_id: respond-to-low-stock-reorder-suggestion
title: "Respond to a Low-Stock Reorder Suggestion in BantooBooks"
feature_area: "Inventory"
audience: "Shop owners and distributors who restock before they run out"
goal: "Act on a low-stock alert by requesting a quote from a supplier over WhatsApp, straight from BantooBooks."
prerequisites:
  - "At least one inventory item has a reorder level set and its stock on hand is at or below that level (see 'Add an Inventory Item in BantooBooks' — a freshly-added item with 0 units on hand and a reorder level already qualifies)."
  - "At least one supplier already exists (see 'Create a Supplier in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  item: "Nestlé NIDO Full Cream Milk Powder 900g x12"
  currentStock: "0 carton"
  reorderLevel: "10 carton"
  suggestedReorderQty: "20 carton"
  supplier: "Cameroon Beverages Wholesale SARL"
step_by_step_actions:
  - step: 1
    action: 'Open "Inventory items" from the sidebar.'
  - step: 2
    action: 'Scroll down to the "Reorder suggestions" section, and find the card for "Nestlé NIDO Full Cream Milk Powder 900g x12" — showing "In stock: 0 carton" and "Reorder level: 10 carton".'
  - step: 3
    action: 'Note the "Suggested reorder: 20 carton" figure and the "No purchase history for this item — choose a supplier below" line on the same card.'
  - step: 4
    action: 'Click "Request quote on WhatsApp" on that card.'
  - step: 5
    action: 'Confirm the "Request a quote" dialog opens, showing the item name at the top.'
  - step: 6
    action: 'Type "Cameroon" into the "Supplier" field and select "Cameroon Beverages Wholesale SARL" from the search results.'
  - step: 7
    action: 'Confirm "Quantity" shows "20" and "Unit" shows "carton", then review the auto-generated "Message" text, which asks the supplier to quote a price, available quantity, delivery date, and payment terms — without mentioning stock levels.'
  - step: 8
    action: 'Click "Open WhatsApp" to open a WhatsApp chat with the supplier, pre-filled with the message.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Inventory items' link visible."
  - step: 2
    screen: "The Inventory items page (/inventory-items), scrolled to the 'Reorder suggestions' section, showing the low-stock card for Nestlé NIDO."
  - step: 3
    screen: "The low-stock card, 'Suggested reorder' figure and supplier line."
  - step: 4
    screen: "The low-stock card, 'Request quote on WhatsApp' button."
  - step: 5
    screen: "The 'Request a quote' modal opening, item name shown at the top."
  - step: 6
    screen: "The 'Request a quote' modal, Supplier search field with results dropdown."
  - step: 7
    screen: "The modal's Quantity, Unit fields, and the Message textarea showing the full generated message."
  - step: 8
    screen: "The modal's 'Open WhatsApp' button, and the resulting WhatsApp Web / wa.me tab opening in the background."
voiceover_script:
  - step: 1
    line: "BantooBooks watches your stock levels for you. Let's see how to act on a low-stock alert. Open Inventory items from the sidebar."
  - step: 2
    line: "Scroll down to Reorder suggestions — this section only shows items that are at or below the reorder level you set for them."
  - step: 3
    line: "BantooBooks also suggests how much to reorder, and a supplier if you've bought this item before."
  - step: 4
    line: "When you're ready to restock, tap 'Request quote on WhatsApp' right on the item's card."
  - step: 5
    line: "This opens a quick request form."
  - step: 6
    line: "Choose which supplier to ask — here we'll search for one."
  - step: 7
    line: "The quantity and unit are pre-filled based on your usual order size, and BantooBooks writes a professional message for you automatically — asking for price, availability, delivery date, and payment terms. Notice it never mentions that your stock is running low — that's between you and BantooBooks."
  - step: 8
    line: "Tap 'Open WhatsApp', and it opens a chat with your supplier, message ready to send — no retyping needed."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Inventory items' sidebar link."
  - step: 2
    highlight: "Box the entire low-stock card for Nestlé NIDO, calling out the stock and reorder-level figures."
  - step: 3
    highlight: "Highlight the 'Suggested reorder' figure and supplier line."
  - step: 4
    highlight: "Zoom on the 'Request quote on WhatsApp' button."
  - step: 5
    highlight: "Highlight the modal title and item name."
  - step: 6
    highlight: "Zoom on the Supplier search field and the selected result."
  - step: 7
    highlight: "Highlight the Quantity, Unit fields, and the full Message textarea."
  - step: 8
    highlight: "Zoom on the 'Open WhatsApp' button on click, then show the new browser tab opening."
expected_result: "A WhatsApp chat (wa.me link) opens in a new tab addressed to Cameroon Beverages Wholesale SARL, with a pre-filled message requesting a quote for 20 cartons of Nestlé NIDO Full Cream Milk Powder 900g x12 — including price, availability, delivery date, and payment terms, with no mention of stock levels."
short_youtube_title: "How to Respond to a Low-Stock Alert in BantooBooks"
youtube_description: |
  Learn how BantooBooks flags items that need restocking and how to
  request a supplier quote over WhatsApp in one click — no manual typing,
  no mention of your stock levels to the supplier.

  What you'll learn:
  - Where BantooBooks shows low-stock reorder suggestions
  - How to request a quote from a supplier over WhatsApp
  - Why the message never reveals your stock levels to suppliers
help_center_article: |
  ## What is a reorder suggestion?

  Any inventory item with a reorder level set (see "Add an Inventory Item
  in BantooBooks") that drops to or below that level automatically appears
  in the "Reorder suggestions" section of the Inventory Items page — along
  with a suggested supplier (based on your purchase history, or a
  preferred supplier if you've set one) and a suggested reorder quantity.

  ## Steps

  Open "Inventory items" and scroll to "Reorder suggestions". Each card
  shows the current stock, reorder level, and suggested reorder quantity
  for that item. Click "Request quote on WhatsApp" to open a dialog where
  you can confirm or search for a different Supplier, adjust the Quantity
  and Unit, and review the auto-generated Message before clicking "Open
  WhatsApp" to send it.

  ## Tip

  The message BantooBooks generates deliberately never mentions "low
  stock" or urgency — it only asks for a price, availability, delivery
  date, and payment terms, so your supplier never sees your internal
  stock position.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Add an inventory item" (using the
  same Nestlé NIDO item, still at 0 on hand with reorder level 10) and
  after "Create a supplier" (Cameroon Beverages Wholesale SARL) so both are
  ready to reference.
  Blur/avoid: nothing sensitive on this page; the WhatsApp tab that opens
  is a wa.me link and doesn't require logging into an account to show the
  pre-filled message.
  Pacing: pause on the Message textarea in step 6 — highlighting that it
  never leaks stock-level details is a meaningful trust point worth calling
  out clearly.
  Click precision: the Supplier field is a search-as-you-type combobox
  (BantooCombobox), not a plain dropdown — type a few letters and wait for
  results before clicking one.
synthesia_script: |
  BantooBooks keeps an eye on your stock levels, so you don't have to
  check manually.

  When an item drops to or below the reorder level you set for it, it
  shows up in the Reorder suggestions section of your Inventory items
  page — along with a suggested supplier and quantity.

  When you're ready to restock, tap 'Request quote on WhatsApp' right from
  the card.

  Confirm the supplier, adjust the quantity if needed, and BantooBooks
  writes a professional message for you automatically — asking for price,
  availability, and delivery terms, without ever mentioning your stock
  levels to the supplier.

  Tap 'Open WhatsApp', and the chat opens ready to send — restocking made
  as simple as one click.
---

# Respond to a Low-Stock Reorder Suggestion in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
