---
tutorial_id: view-a-customer-statement
title: "View a Customer's Statement in BantooBooks"
feature_area: "Reports"
audience: "Shop owners, distributors, and bookkeepers who need to share or check a customer's account"
goal: "Generate a customer statement showing their invoices, payments, and running balance over a chosen period."
prerequisites:
  - "At least one customer with some invoice or receipt history already exists (see 'Create a Sales Invoice in BantooBooks' and 'Record a Customer Receipt in BantooBooks')."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  customer: "Alimentation Baobab Douala"
  from: "2026-07-01"
  to: "2026-07-06"
step_by_step_actions:
  - step: 1
    action: 'Open "Reports" from the sidebar.'
  - step: 2
    action: 'Under the "Who owes you" section, click "Customer Statement".'
  - step: 3
    action: 'Open the "Customer" dropdown and select "Alimentation Baobab Douala".'
  - step: 4
    action: 'Set the "From" date to "2026-07-01".'
  - step: 5
    action: 'Set the "To" date to "2026-07-06".'
  - step: 6
    action: 'Click "View".'
  - step: 7
    action: 'Confirm the statement shows an "Opening balance" row, one row per transaction in the period, and a "Closing balance" total that matches the "Balance due" figure shown at the top right.'
  - step: 8
    action: 'Click "Print / PDF" if you want a printable copy of the statement.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Reports' link visible."
  - step: 2
    screen: "The Reports page (/reports), showing report cards grouped into sections including 'Who owes you'; the pointer clicking the 'Customer Statement' card."
  - step: 3
    screen: "The Customer Statement page (/reports/customer-statement), its filter row at the top with the Customer dropdown open."
  - step: 4
    screen: "The filter row, From date field."
  - step: 5
    screen: "The filter row, To date field."
  - step: 6
    screen: "The filter row, with the 'View' button."
  - step: 7
    screen: "The generated statement card: header with company name and 'Statement for' the customer, the Period and Balance due figures at top right, then the transactions table with Opening balance and Closing balance rows."
  - step: 8
    screen: "The filter row again, with the 'Print / PDF' button now visible next to 'View' (it only appears once a customer is selected)."
voiceover_script:
  - step: 1
    line: "If a customer ever asks for a summary of their account, or you just want to double check it yourself, BantooBooks can generate a statement. Open Reports from the sidebar."
  - step: 2
    line: "Under 'Who owes you', choose 'Customer Statement'."
  - step: 3
    line: "Pick the customer you want a statement for."
  - step: 4
    line: "Choose the start of the period you're interested in."
  - step: 5
    line: "And the end of that period."
  - step: 6
    line: "Tap 'View' to generate it."
  - step: 7
    line: "And here it is — every invoice and payment in that window, with a running balance, starting from their opening balance and ending at their closing balance for the period."
  - step: 8
    line: "If you need to hand this to someone or keep a paper copy, 'Print / PDF' gives you a clean, printable version."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Reports' sidebar link."
  - step: 2
    highlight: "Circle the 'Customer Statement' card under 'Who owes you'."
  - step: 3
    highlight: "Zoom on the Customer dropdown and the selected name."
  - step: 4
    highlight: "Highlight the From date field."
  - step: 5
    highlight: "Highlight the To date field."
  - step: 6
    highlight: "Zoom on the 'View' button on click."
  - step: 7
    highlight: "Box the 'Balance due' figure at top right, then box the Opening balance and Closing balance rows in the table."
  - step: 8
    highlight: "Circle the 'Print / PDF' button."
expected_result: "The Customer Statement page displays a statement for 'Alimentation Baobab Douala' covering 1-6 July 2026: an Opening balance row, one row for each invoice/receipt/credit note in that window with its running balance, and a Closing balance that matches the 'Balance due' figure shown at the top of the statement."
short_youtube_title: "How to View a Customer Statement in BantooBooks"
youtube_description: |
  See how to generate a customer statement in BantooBooks — a clean summary
  of a customer's invoices, payments, and running balance over any date
  range you choose, ready to print or share.

  What you'll learn:
  - Where to find Customer Statement inside Reports
  - How to filter a statement to a specific customer and date range
  - How the opening and closing balance figures are calculated
help_center_article: |
  ## Why generate a customer statement?

  A customer statement is a clean, dated summary of everything that
  happened on one customer's account — every invoice, every payment they
  made, and their running balance — over whatever period you choose. It's
  useful for answering "how much do I owe you and for what?" questions from
  a customer, or for your own record-keeping.

  ## Steps

  Open "Reports" from the sidebar, then choose "Customer Statement" under
  the "Who owes you" section. Select the Customer from the dropdown, then
  set a From and To date to define the period you want. Click "View" to
  generate the statement.

  The statement shows an Opening balance (everything before your From
  date), then one row per invoice, receipt, or credit note within the
  period with a running balance, ending in a Closing balance that matches
  the "Balance due" figure shown at the top of the page. Once a customer is
  selected, a "Print / PDF" button appears if you need a printable copy.

  ## Tip

  Leave the From and To dates blank to see the customer's entire history in
  one statement, from their very first transaction to today.
guidde_recording_notes: |
  Zoom level: 100%. Record this after "Create a sales invoice" and "Record a
  customer receipt" for the same customer so the statement has at least one
  invoice and one receipt to show, rather than an empty "No transactions in
  this period" state.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause on the generated statement table for a couple of seconds so
  viewers can actually read the Opening balance / transaction rows /
  Closing balance structure.
  Click precision: the Customer dropdown is a native <select> — click it,
  then choose the customer by name from the list; no search/filter is
  available on this particular dropdown.
synthesia_script: |
  Sometimes you or a customer need a clear summary of their account —
  that's what a customer statement is for.

  From Reports, choose Customer Statement.

  Pick the customer, then choose a start and end date for the period you
  want to look at.

  Generate the statement, and you'll see an opening balance, every invoice
  and payment in that period, and a closing balance at the end — the exact
  same figure as their current balance due.

  If you need a paper copy, or want to send it to the customer, there's a
  print option too.

  It's a simple way to answer "how much do I owe, and for what" — without
  digging through invoices one by one.
---

# View a Customer's Statement in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
