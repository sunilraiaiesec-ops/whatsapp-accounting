---
tutorial_id: create-a-supplier
title: "Create a Supplier in BantooBooks"
feature_area: "Suppliers"
audience: "New BantooBooks users, shop owners, and bookkeepers"
goal: "Add a new supplier to BantooBooks so you can record purchases and payments to them."
prerequisites:
  - "A BantooBooks account with access to an organization (e.g. logged in as central.demo@bantoobooks.com)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  name: "Cameroon Beverages Wholesale SARL"
  type: "Supplier"
  phone: "233 42 15 60"
  country: "Cameroon"
  city: "Douala"
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "+ Add supplier" pill under "Create actions".'
  - step: 2
    action: 'On the Suppliers page, in the quick-add form, type "Cameroon Beverages Wholesale SARL" into the "Name" field.'
  - step: 3
    action: 'Confirm the "Type" dropdown already shows "Supplier" (it is the default on this page).'
  - step: 4
    action: 'Type "233 42 15 60" into the "Phone" field.'
  - step: 5
    action: 'Click "+ WhatsApp / Country / City" to reveal the extra fields.'
  - step: 6
    action: 'Type "Cameroon" into "Country" and "Douala" into "City" (leave WhatsApp blank — this supplier only uses a landline).'
  - step: 7
    action: 'Click "Add contact".'
  - step: 8
    action: 'If a "Possible existing contact found" box appears instead, review it — click "Use existing contact" if it is the same company, or "Create new anyway" if it is genuinely new.'
  - step: 9
    action: 'Confirm "Cameroon Beverages Wholesale SARL" now appears at the top of the supplier list, and the "Suppliers" count in the stat cards has gone up by 1.'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard (Home), showing the 'Create actions' row of pill buttons."
  - step: 2
    screen: "The Suppliers page (/suppliers): stat cards at the top, then the quick-add form card, then the supplier list below it."
  - step: 3
    screen: "The quick-add form, focused on the Type dropdown showing 'Supplier'."
  - step: 4
    screen: "The quick-add form, focused on the Phone input."
  - step: 5
    screen: "The quick-add form, with the '+ WhatsApp / Country / City' link visible."
  - step: 6
    screen: "The quick-add form expanded, with Country and City filled in and WhatsApp left empty."
  - step: 7
    screen: "The quick-add form with the 'Add contact' button, briefly showing an 'Adding…' state."
  - step: 8
    screen: "The amber 'Possible existing contact found' panel, if it appears, with its two action buttons."
  - step: 9
    screen: "The Suppliers page again, now with the new row at the top of the list and the updated 'Suppliers' stat card."
voiceover_script:
  - step: 1
    line: "Now let's add a supplier — someone you buy stock or goods from. Tap 'Add supplier' on your dashboard."
  - step: 2
    line: "Type the supplier's business name — here we're using 'Cameroon Beverages Wholesale SARL'."
  - step: 3
    line: "Because we started from the Suppliers page, BantooBooks has already set the type to 'Supplier' for us."
  - step: 4
    line: "Add their phone number so you can always reach them."
  - step: 5
    line: "Tap this small link if you also want to record their country or city."
  - step: 6
    line: "We'll leave WhatsApp blank here, since not every supplier uses it — that's completely fine."
  - step: 7
    line: "Tap 'Add contact' to save the supplier."
  - step: 8
    line: "Just like with customers, BantooBooks will flag a possible match first if one already looks similar, so you never end up with the same supplier twice."
  - step: 9
    line: "Your supplier is saved. Now you're ready to record what you buy from them, and track what you owe."
on_screen_highlights:
  - step: 1
    highlight: "Circle the '+ Add supplier' pill."
  - step: 2
    highlight: "Highlight the Name input as text is typed."
  - step: 3
    highlight: "Box the Type dropdown showing 'Supplier'."
  - step: 4
    highlight: "Highlight the Phone input."
  - step: 5
    highlight: "Circle the '+ WhatsApp / Country / City' text link."
  - step: 6
    highlight: "Highlight Country and City inputs; note the empty WhatsApp field is intentional."
  - step: 7
    highlight: "Zoom on the 'Add contact' button on click."
  - step: 8
    highlight: "If shown, box the amber duplicate-contact panel."
  - step: 9
    highlight: "Circle the new row and the 'Suppliers' stat card number."
expected_result: "The new supplier 'Cameroon Beverages Wholesale SARL' appears as a row in the Suppliers list, and the 'Suppliers' stat card count increases by 1. Clicking the name opens their contact page with a 0 XAF balance and an empty transaction ledger (their Accounts Payable history)."
short_youtube_title: "How to Add a New Supplier in BantooBooks"
youtube_description: |
  Learn how to add a supplier to BantooBooks so you can start recording what
  you buy from them and what you owe. This quick walkthrough uses the same
  simple quick-add form as adding a customer, just on the Suppliers page.

  What you'll learn:
  - Where to find "Add supplier" from your dashboard
  - Which fields are required vs optional for a supplier
  - How BantooBooks flags a possible duplicate supplier before saving
help_center_article: |
  ## Why add suppliers in BantooBooks?

  Suppliers back your Accounts Payable — BantooBooks' running list of "who I
  owe money to and how much." Once a supplier exists, you can record goods
  you've received from them and payments you've made to them, and see their
  full balance and history in one place.

  ## Steps

  From your dashboard, click the "+ Add supplier" pill in the Create actions
  row (or open the Suppliers page from the sidebar directly). At the top of
  the Suppliers page there's a small form: type the supplier's Name, and
  BantooBooks will leave Type set to "Supplier" automatically. Add their Phone
  number if you have it.

  If you want to record their WhatsApp number, Country, or City, click
  "+ WhatsApp / Country / City" to open those extra fields — none of them are
  required, and a supplier without a WhatsApp number (many local wholesalers
  only use a landline) is perfectly normal.

  Click "Add contact" to save. As with customers, BantooBooks checks for a
  close name or matching phone/WhatsApp number among your existing contacts
  first. If it finds a possible match, it will show it to you before saving —
  choose "Use existing contact" if it's the same company, or "Create new
  anyway" if it's a different supplier.

  ## Tip

  A contact can be both a customer and a supplier at the same time — just
  choose "Both" in the Type dropdown if that fits your relationship with them.
guidde_recording_notes: |
  Zoom level: 100% browser zoom. Log in as the central.demo@bantoobooks.com
  demo account so the supplier list already has ~40 rows before recording —
  this makes the "count went up by 1" moment clearly visible.
  Blur/avoid: don't show the account/org switcher if other demo companies
  appear in it.
  Pacing: pause ~1s after the page transition to /suppliers; pause briefly on
  the Type dropdown to make clear it already reads "Supplier" without needing
  to be changed.
  Click precision: click precisely on the "+ WhatsApp / Country / City" text
  link (not a button) — consider a zoom-in call-out since it's easy to miss.
synthesia_script: |
  Adding a supplier to BantooBooks is just as quick as adding a customer.

  From your dashboard, choose "Add supplier." Type in the supplier's business
  name — for example, a wholesaler you buy drinks or groceries from.

  Because you're adding this contact as a supplier, BantooBooks sets that
  automatically. Add a phone number if you have one.

  If you'd like, you can also record their country and city using a small
  link that reveals a few extra fields. WhatsApp is optional too — plenty of
  suppliers only use a regular phone line, and that's perfectly fine.

  Save the contact, and if BantooBooks spots a very similar supplier already
  in your list, it will check with you first, so you never end up with
  duplicates.

  That's it. Your supplier is now saved, ready for you to record purchases
  and track exactly what you owe them.
---

# Create a Supplier in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
