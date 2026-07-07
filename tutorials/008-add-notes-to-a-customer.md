---
tutorial_id: add-notes-to-a-customer
title: "Add Notes to a Customer in BantooBooks"
feature_area: "Customers"
audience: "Shop owners, distributors, and cashiers who deal with customers regularly"
goal: "Save freeform notes on a customer's profile so anyone on your team can see important context about them."
prerequisites:
  - "At least one customer already exists (see 'Create a Customer in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Alimentation Baobab Douala"
  notes: "Prefers delivery in the morning, before 10am. Usually pays by bank transfer within a week of the invoice date. Ask for Madame Ateba at the counter."
step_by_step_actions:
  - step: 1
    action: 'Open "Customers" from the sidebar.'
  - step: 2
    action: 'Click "Alimentation Baobab Douala" in the customer list to open their page.'
  - step: 3
    action: 'Click the "Notes" tab.'
  - step: 4
    action: 'Confirm the "Notes" textarea is currently empty.'
  - step: 5
    action: 'Type "Prefers delivery in the morning, before 10am. Usually pays by bank transfer within a week of the invoice date. Ask for Madame Ateba at the counter." into the "Notes" textarea.'
  - step: 6
    action: 'Click "Save notes".'
  - step: 7
    action: 'Confirm a "Saved." message appears next to the button.'
  - step: 8
    action: 'Refresh the page and confirm the same text is still there in the Notes textarea.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Customers' link visible."
  - step: 2
    screen: "The Customers page (/customers), with the pointer clicking the 'Alimentation Baobab Douala' link."
  - step: 3
    screen: "The customer's page (/customers/{id}), with the row of tabs (Overview, Transactions, Invoices, Payments, Products, Documents, Notes, AI Memory) at the top; the pointer clicking 'Notes'."
  - step: 4
    screen: "The Notes tab: a single card with a large, empty 'Notes' textarea."
  - step: 5
    screen: "The Notes tab, textarea being typed into."
  - step: 6
    screen: "The Notes tab, with the 'Save notes' button below the textarea."
  - step: 7
    screen: "The 'Saved.' confirmation text next to the Save notes button."
  - step: 8
    screen: "The same Notes tab after a page refresh, showing the persisted text."
voiceover_script:
  - step: 1
    line: "Sometimes there's useful context about a customer that doesn't fit into a phone number or address field. Open Customers from the sidebar."
  - step: 2
    line: "Let's open 'Alimentation Baobab Douala'."
  - step: 3
    line: "Tap the 'Notes' tab."
  - step: 4
    line: "Right now it's empty."
  - step: 5
    line: "Here you can type anything worth remembering — delivery preferences, how they usually pay, or who to ask for on site."
  - step: 6
    line: "Tap 'Save notes'."
  - step: 7
    line: "You'll see a quick 'Saved.' confirmation."
  - step: 8
    line: "And even after refreshing the page, the note is still there — anyone on your team who opens this customer later will see exactly the same thing."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Customers' sidebar link."
  - step: 2
    highlight: "Circle the customer's name link in the list."
  - step: 3
    highlight: "Circle the 'Notes' tab in the tab row."
  - step: 4
    highlight: "Highlight the empty Notes textarea."
  - step: 5
    highlight: "Highlight the Notes textarea as text is typed."
  - step: 6
    highlight: "Zoom on the 'Save notes' button on click."
  - step: 7
    highlight: "Circle the 'Saved.' text."
  - step: 8
    highlight: "Circle the textarea content after the page refresh."
expected_result: "The customer's Notes tab shows the saved text after clicking 'Save notes' and after a page refresh — a 'Saved.' confirmation appears immediately next to the button, and the note persists the next time the page is opened."
short_youtube_title: "How to Add Notes to a Customer in BantooBooks"
youtube_description: |
  Learn how to save freeform notes on a customer's profile in BantooBooks —
  handy for delivery preferences, payment habits, or anything else worth
  remembering that doesn't fit a regular field.

  What you'll learn:
  - Where the Notes tab lives on a customer's page
  - How to save and update a customer's notes
  - Why shared notes help an entire team, not just one person
help_center_article: |
  ## Why add notes to a customer?

  Not everything worth knowing about a customer fits into a phone number or
  address field — things like delivery preferences, how they usually pay,
  or who to ask for at their shop are all useful context. BantooBooks gives
  every customer a Notes tab for exactly this kind of freeform information,
  visible to anyone on your team who opens that customer later.

  ## Steps

  Open the customer from the Customers list, then click the "Notes" tab
  (it's one of the tabs alongside Overview, Transactions, Invoices, and so
  on). Type whatever you'd like to remember into the Notes textarea, then
  click "Save notes".

  ## Tip

  Notes are a single freeform block of text per customer — there's no
  separate list of dated entries, so if you want to add to an existing
  note rather than replace it, open the Notes tab first and add your new
  text to what's already there before saving.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com and open
  "Alimentation Baobab Douala" before recording.
  Blur/avoid: nothing sensitive on this tab by default — just be mindful not
  to type any real customer's private information into the demo note text.
  Pacing: no particular timing concerns; this is one of the simplest
  tutorials to record.
  Click precision: the tab row scrolls horizontally on narrow browser
  widths — make sure "Notes" is visible/clickable before recording, or widen
  the window first.
synthesia_script: |
  Not every useful detail about a customer fits neatly into a phone number
  or address field.

  That's what the Notes tab on a customer's page is for.

  Open any customer, go to their Notes tab, and type in whatever's worth
  remembering — delivery preferences, how they usually pay, or who to ask
  for when you call.

  Save it, and from then on, anyone on your team who opens that customer
  sees exactly the same note — not just you.
---

# Add Notes to a Customer in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
