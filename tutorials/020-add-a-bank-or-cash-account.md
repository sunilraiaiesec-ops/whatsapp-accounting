---
tutorial_id: add-a-bank-or-cash-account
title: "Add a Bank or Cash Account in BantooBooks"
feature_area: "Banking"
audience: "Shop owners and bookkeepers setting up where their money is held"
goal: "Add a new bank, cash, or credit card account so you can record payments, receipts, and transfers against it."
prerequisites:
  - "A BantooBooks account with access to an organization (e.g. logged in as central.demo@bantoobooks.com)."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  name: "Ecobank Cameroun — XAF"
  type: "Bank account"
step_by_step_actions:
  - step: 1
    action: 'Open "Bank and Cash Accounts" from the sidebar.'
  - step: 2
    action: 'Note the default "1000 — Cash on hand" account already in the list, and the current "Account" stat card count.'
  - step: 3
    action: 'In the "Add account" form, type "Ecobank Cameroun — XAF" into the "Account name" field.'
  - step: 4
    action: 'Open the "Type" dropdown to see the three options: "Bank account", "Cash account", and "Credit card".'
  - step: 5
    action: 'Select "Bank account".'
  - step: 6
    action: 'Click "Add account".'
  - step: 7
    action: 'Confirm the new account "Ecobank Cameroun — XAF" appears in the list below with type "bank" and a balance of "0".'
  - step: 8
    action: 'Confirm the "Account" stat card count has gone up by 1.'
screen_to_show:
  - step: 1
    screen: "The sidebar, with the 'Bank and Cash Accounts' link visible."
  - step: 2
    screen: "The Bank and Cash Accounts page (/bank-and-cash-accounts): stat cards at the top, then the account list showing the default cash account."
  - step: 3
    screen: "The 'Add account' form, 'Account name' field being typed into."
  - step: 4
    screen: "The 'Add account' form, Type dropdown open, showing 'Bank account', 'Cash account', and 'Credit card' options."
  - step: 5
    screen: "The 'Add account' form, Type dropdown showing 'Bank account' selected."
  - step: 6
    screen: "The 'Add account' form with the 'Add account' button, briefly showing an 'Adding…' state."
  - step: 7
    screen: "The Bank and Cash Accounts page again, with the new row in the account list."
  - step: 8
    screen: "The updated 'Account' stat card at the top of the page."
voiceover_script:
  - step: 1
    line: "Before you can record payments or receipts, BantooBooks needs to know where your money actually lives. Open Bank and Cash Accounts from the sidebar."
  - step: 2
    line: "You'll already see your default cash account here."
  - step: 3
    line: "Give the new account a clear name — including the currency is a good habit if you manage more than one."
  - step: 4
    line: "Choose the type: bank account, cash account, or credit card."
  - step: 5
    line: "We'll leave it as a bank account."
  - step: 6
    line: "Tap 'Add account' to save it."
  - step: 7
    line: "And that's it — the new account is ready to use."
  - step: 8
    line: "You can now select it whenever you record a payment, receipt, or transfer, and BantooBooks will track its running balance automatically."
on_screen_highlights:
  - step: 1
    highlight: "Circle the 'Bank and Cash Accounts' sidebar link."
  - step: 2
    highlight: "Highlight the existing account row and the 'Account' stat card."
  - step: 3
    highlight: "Highlight the 'Account name' input."
  - step: 4
    highlight: "Zoom on the Type dropdown and its three options."
  - step: 5
    highlight: "Highlight 'Bank account' selected in the dropdown."
  - step: 6
    highlight: "Zoom on the 'Add account' button on click."
  - step: 7
    highlight: "Circle the new row in the list."
  - step: 8
    highlight: "Circle the updated 'Account' stat card number."
expected_result: "The new account 'Ecobank Cameroun — XAF' appears in the Bank and Cash Accounts list with type 'bank' and a starting balance of 0 XAF. The 'Account' stat card count increases by 1, and the account is now selectable anywhere a bank/cash account is chosen (payments, receipts, goods receipts, refunds, transfers)."
short_youtube_title: "How to Add a Bank or Cash Account in BantooBooks"
youtube_description: |
  Learn how to add a new bank account, cash account, or credit card in
  BantooBooks — the first step before recording any payment, receipt, or
  transfer against it.

  What you'll learn:
  - How to add a bank, cash, or credit card account
  - Where new accounts show up once created
  - Why account type matters for reporting
help_center_article: |
  ## Why add a bank or cash account?

  Every payment, receipt, refund, or transfer in BantooBooks needs to
  specify which of your real-world accounts the money moved through.
  Before you can record any of those, the account itself needs to exist in
  BantooBooks.

  ## Steps

  Open "Bank and Cash Accounts" from the sidebar. In the "Add account" form
  near the top of the page, type a clear Account name — including the bank
  name and currency (e.g. "Ecobank Cameroun — XAF") makes it easy to tell
  accounts apart later. Choose the Type: "Bank account", "Cash account", or
  "Credit card", then click "Add account".

  ## Tip

  New accounts start with a balance of 0. If you're migrating an existing
  business into BantooBooks with real starting balances, use the Migration
  Wizard's Opening Balances step instead of trying to set a balance here
  directly — balances always come from recorded transactions, never a
  manual override.
guidde_recording_notes: |
  Zoom level: 100%. Log in as central.demo@bantoobooks.com so the account
  list already shows the default '1000 — Cash on hand' account, making the
  "new account added to an existing list" moment clear.
  Blur/avoid: nothing sensitive on this page.
  Pacing: pause briefly on the Type dropdown — call out that credit cards
  are tracked as accounts too, since that's easy to overlook.
  Click precision: the 'Add account' form is a single-row flex-wrap layout
  (Account name, Type, Add account button) — on a normal browser width it
  should fit on one line, but may wrap on narrower viewports.
synthesia_script: |
  Before you can record a payment or receipt, BantooBooks needs to know
  where your money lives. Let's add a bank account.

  Open Bank and Cash Accounts, and use the form near the top of the page.

  Give the account a clear name — including the currency is a good habit
  if you manage more than one account.

  Choose the type — bank account, cash account, or credit card — then
  save.

  Your new account is ready immediately. You can now pick it whenever you
  record a payment, receipt, or transfer, and BantooBooks tracks its
  running balance for you automatically from there.
---

# Add a Bank or Cash Account in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
