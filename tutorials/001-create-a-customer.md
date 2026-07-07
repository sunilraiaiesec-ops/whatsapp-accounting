---
tutorial_id: create-a-customer
title: "Create a Customer in BantooBooks"
feature_area: "Customers"
audience: "New BantooBooks users, shop owners, and cashiers"
goal: "Add a new customer to BantooBooks so you can start invoicing them and tracking what they owe you."
prerequisites:
  - "A BantooBooks account with access to an organization (e.g. logged in as central.demo@bantoobooks.com)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  name: "Alimentation Baobab Douala"
  type: "Customer"
  phone: "677 45 12 89"
  whatsapp: "677 45 12 89"
  country: "Cameroon"
  city: "Douala"
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "+ Add customer" pill under "Create actions".'
  - step: 2
    action: 'On the Customers page, in the quick-add form, type "Alimentation Baobab Douala" into the "Name" field.'
  - step: 3
    action: 'Confirm the "Type" dropdown already shows "Customer" (it is the default on this page).'
  - step: 4
    action: 'Type "677 45 12 89" into the "Phone" field.'
  - step: 5
    action: 'Click "+ WhatsApp / Country / City" to reveal the extra fields.'
  - step: 6
    action: 'Type "677 45 12 89" into "WhatsApp", "Cameroon" into "Country", and "Douala" into "City".'
  - step: 7
    action: 'Click "Add contact".'
  - step: 8
    action: 'If a "Possible existing contact found" box appears instead, review the suggested match — click "Use existing contact" if it is really the same shop, or click "Create new anyway" if it is a different customer.'
  - step: 9
    action: 'Confirm "Alimentation Baobab Douala" now appears at the top of the customer list, and the "Customers" count in the stat cards has gone up by 1.'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard (Home), showing the greeting, the category pills, and the 'Create actions' row of pill buttons."
  - step: 2
    screen: "The Customers page (/customers): stat cards at the top, then the quick-add form card, then the customer list below it."
  - step: 3
    screen: "The quick-add form, focused on the Type dropdown."
  - step: 4
    screen: "The quick-add form, focused on the Phone input."
  - step: 5
    screen: "The quick-add form, with the '+ WhatsApp / Country / City' link visible just after the Phone field."
  - step: 6
    screen: "The quick-add form, now expanded to show WhatsApp, Country and City inputs side by side with Name/Type/Phone."
  - step: 7
    screen: "The quick-add form with the 'Add contact' button, briefly showing an 'Adding…' state."
  - step: 8
    screen: "The amber 'Possible existing contact found' panel that can appear below the form, listing matched contacts with 'Use existing contact' and 'Create new anyway' buttons."
  - step: 9
    screen: "The Customers page again, now with the new row at the top of the list and the updated 'Customers' stat card."
voiceover_script:
  - step: 1
    line: "Let's add a new customer. From your dashboard, tap 'Add customer'."
  - step: 2
    line: "Type the shop's name — here we're using 'Alimentation Baobab Douala'."
  - step: 3
    line: "BantooBooks already knows this is a customer, so we can leave that as is."
  - step: 4
    line: "Add their phone number. This makes it easy to reach them later, and helps BantooBooks spot if you're about to add the same contact twice."
  - step: 5
    line: "If you also want to save their WhatsApp number, country, or city, tap this small link to open a few more fields."
  - step: 6
    line: "Fill those in too — you don't have to, but it helps later, especially the WhatsApp number if you send receipts that way."
  - step: 7
    line: "Now tap 'Add contact' to save."
  - step: 8
    line: "Sometimes BantooBooks will notice a contact that looks similar and ask you to check first. This stops you from creating the same customer twice by mistake. If it really is a new customer, just tap 'Create new anyway'."
  - step: 9
    line: "And that's it — your new customer is saved and ready. You can now create invoices and record payments for them."
on_screen_highlights:
  - step: 1
    highlight: "Circle the '+ Add customer' pill in the Create actions row."
  - step: 2
    highlight: "Highlight the Name input as text is typed."
  - step: 3
    highlight: "Box the Type dropdown showing 'Customer'."
  - step: 4
    highlight: "Highlight the Phone input."
  - step: 5
    highlight: "Circle the '+ WhatsApp / Country / City' text link."
  - step: 6
    highlight: "Highlight WhatsApp, Country, and City inputs in sequence as each is filled."
  - step: 7
    highlight: "Zoom on the 'Add contact' button on click."
  - step: 8
    highlight: "If shown, box the whole amber duplicate-contact panel and circle the two action buttons."
  - step: 9
    highlight: "Circle the new row in the list and the 'Customers' stat card number."
expected_result: "The new customer 'Alimentation Baobab Douala' appears as a row in the Customers list (with its phone number shown), and the 'Customers' stat card count increases by 1. Clicking the name opens their contact page with a 0 XAF balance and an empty transaction ledger."
short_youtube_title: "How to Add a New Customer in BantooBooks"
youtube_description: |
  Learn how to add a new customer to BantooBooks in under a minute — perfect for
  shop owners and distributors who want to start invoicing and tracking who
  owes them money. We use the quick-add form right on the Customers page, and
  show you what happens if BantooBooks spots a possible duplicate contact.

  What you'll learn:
  - Where to find "Add customer" from your dashboard
  - Which fields are required vs optional
  - How BantooBooks helps you avoid creating duplicate contacts
help_center_article: |
  ## Why add customers in BantooBooks?

  Every customer you add becomes part of your Accounts Receivable — in plain
  terms, BantooBooks' running list of "who owes me money and how much." Once a
  customer exists, you can create sales invoices for them, record their
  payments, and see their full balance and history in one place.

  ## Steps

  From your dashboard, click the "+ Add customer" pill in the Create actions
  row (or go directly to the Customers page from the sidebar). At the top of
  the Customers page you'll see a small form: type the customer's Name, and
  BantooBooks will leave Type set to "Customer" automatically. Add their Phone
  number if you have it — this is optional but recommended.

  If you also want to record their WhatsApp number, Country, or City, click
  "+ WhatsApp / Country / City" to reveal those extra fields. These are handy
  for looking up a customer by area later, but you can always come back and
  fill them in from the customer's profile page.

  Click "Add contact" to save. BantooBooks checks your existing contacts for a
  close name or matching phone/WhatsApp number first — if it finds one, it
  will show you the possible match instead of saving right away, so you don't
  end up with the same customer listed twice. Choose "Use existing contact" if
  it's the same shop, or "Create new anyway" if it's genuinely a different
  customer.

  ## Tip

  You don't need an email, address, or credit terms to get started — those
  live on the customer's Profile tab and can be filled in any time later.
guidde_recording_notes: |
  Zoom level: 100% browser zoom so field labels stay crisp. Log in as the
  central.demo@bantoobooks.com demo account before recording so the customer
  list already has ~120 rows — this makes the "count went up by 1" moment
  visible without looking like an empty/fake account.
  Blur/avoid: don't show the account/org switcher dropdown if other demo
  companies are visible in it; don't show the exact demo password on screen
  even though it's non-sensitive.
  Pacing: pause ~1s after clicking "+ Add customer" so the page transition is
  visible; pause ~1.5s on the "Possible existing contact found" panel if it
  appears, since first-time viewers need a beat to read it.
  Click precision: the "+ WhatsApp / Country / City" control is a small text
  link, not a button — click precisely on the text, and consider a manual
  zoom-in call-out here since it's easy to miss in a wide shot.
synthesia_script: |
  Adding a new customer to BantooBooks takes less than a minute.

  From your dashboard, choose "Add customer." Type in the shop's name — for
  example, a local grocery store you supply.

  BantooBooks automatically sets this contact as a customer, so you don't need
  to change anything there.

  Add a phone number if you have one. This isn't required, but it helps you
  reach your customer later, and it helps BantooBooks warn you if you're about
  to add the same contact a second time.

  If you'd like to save a WhatsApp number, country, or city too, there's a
  small link to reveal a few extra fields. Totally optional.

  Once you're happy with the details, save the contact.

  Sometimes, BantooBooks will notice a very similar contact already exists,
  and ask you to double check before creating a new one. This keeps your
  customer list clean and avoids duplicate entries.

  And that's it. Your new customer is saved, ready for you to send invoices
  and record payments against — all in one place.
---

# Create a Customer in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
