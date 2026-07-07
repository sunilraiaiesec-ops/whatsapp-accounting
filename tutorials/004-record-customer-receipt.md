---
tutorial_id: record-customer-receipt
title: "Record a Customer Receipt in BantooBooks"
feature_area: "Receipts"
audience: "Shop owners, distributors, and bookkeepers collecting money from customers"
goal: "Record money received from a customer as a receipt, so their balance goes down and your bank/cash balance goes up. (A receipt is money coming IN from a customer — a payment is money going OUT, e.g. to a supplier.)"
prerequisites:
  - "At least one customer already exists (see 'Create a Customer in BantooBooks')."
  - "At least one bank or cash account exists (BantooBooks creates a default '1010 — Bank accounts' account for every new organization)."
  - "Optionally, an existing unpaid sales invoice for that customer (see 'Create a Sales Invoice in BantooBooks') so you can apply the receipt against it."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  receivedFrom: "Alimentation Baobab Douala"
  depositTo: "1010 — Bank accounts"
  paymentDate: "2026-07-06"
  paymentMethod: "Bank transfer"
  referenceNo: "TRF-88214"
  creditAccount: "1100 — Accounts receivable"
  lineDescription: "Receipt for invoice PO-2031"
  amount: "31,005"
  memo: "Received in full for July delivery, invoice PO-2031."
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "+ Record receipt" pill under "Create actions".'
  - step: 2
    action: 'On the New Receipt page, open the "Received from" dropdown and select "Alimentation Baobab Douala".'
  - step: 3
    action: 'Open the "Deposit to" dropdown and select "1010 — Bank accounts". Note the account balance shown just below it.'
  - step: 4
    action: 'Confirm "Payment date" already shows today''s date.'
  - step: 5
    action: 'Open the "Payment method" dropdown and select "Bank transfer".'
  - step: 6
    action: 'Type "TRF-88214" into "Reference no.".'
  - step: 7
    action: 'In the "Category details" table, open the "Credit account" dropdown on the first row and select "1100 — Accounts receivable" — this tells BantooBooks the money is settling an invoice, not a brand-new sale.'
  - step: 8
    action: 'Type "Receipt for invoice PO-2031" into the "Description" cell for that line.'
  - step: 9
    action: 'Type "31,005" into the "Amount" cell for that line.'
  - step: 10
    action: 'Type "Received in full for July delivery, invoice PO-2031." into the "Memo" field.'
  - step: 11
    action: 'Confirm "Amount received" at the top right shows "31,005".'
  - step: 12
    action: 'Click "Save and close".'
  - step: 13
    action: 'Confirm the new receipt appears at the top of the Receipts list, and that the sales invoice for "Alimentation Baobab Douala" now shows status "Paid".'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard, showing the 'Create actions' row."
  - step: 2
    screen: "The New Receipt page (/receipts/new), top section with 'Received from' dropdown open."
  - step: 3
    screen: "The 'Deposit to' dropdown, with the account balance label visible underneath once selected."
  - step: 4
    screen: "The Payment date field."
  - step: 5
    screen: "The Payment method dropdown."
  - step: 6
    screen: "The Reference no. field."
  - step: 7
    screen: "The 'Category details' table, Credit account dropdown on the first row."
  - step: 8
    screen: "The 'Category details' table, Description cell."
  - step: 9
    screen: "The 'Category details' table, Amount cell (right-aligned)."
  - step: 10
    screen: "The Memo textarea near the bottom of the form."
  - step: 11
    screen: "The 'Amount received' total shown at the top right of the form card."
  - step: 12
    screen: "The bottom action bar with 'Print' and 'Save and close' buttons."
  - step: 13
    screen: "The Receipts list page (/receipts) showing the new row, then the Sales Invoices list showing the same invoice now marked 'Paid'."
voiceover_script:
  - step: 1
    line: "When a customer pays you, we record that as a receipt — money coming into your business. Tap 'Record receipt' on your dashboard."
  - step: 2
    line: "Choose who paid you — here it's 'Alimentation Baobab Douala'."
  - step: 3
    line: "Choose which bank or cash account the money landed in. BantooBooks shows you that account's current balance right underneath, so you can double check."
  - step: 4
    line: "The date defaults to today, which is usually correct."
  - step: 5
    line: "Pick how they paid you — bank transfer, mobile money, cash, whatever fits."
  - step: 6
    line: "If you have a transfer or transaction reference, add it here — it's handy for matching against your bank statement later."
  - step: 7
    line: "This part matters: choose 'Accounts receivable' here, because this receipt is settling an invoice this customer already owes you for — not a brand new sale."
  - step: 8
    line: "Add a short note about what this receipt is for."
  - step: 9
    line: "Enter the amount they paid."
  - step: 10
    line: "You can add one more note for your own records here too."
  - step: 11
    line: "Double check the total matches what you actually received."
  - step: 12
    line: "Tap 'Save and close' to record the receipt."
  - step: 13
    line: "And that's it — the receipt is saved, the customer's balance goes down, and if it matches an invoice in full, that invoice flips from 'Unpaid' to 'Paid' automatically."
on_screen_highlights:
  - step: 1
    highlight: "Circle the '+ Record receipt' pill."
  - step: 2
    highlight: "Zoom on the 'Received from' dropdown and selected name."
  - step: 3
    highlight: "Highlight the 'Deposit to' dropdown and the balance label that appears below it."
  - step: 4
    highlight: "Highlight the Payment date field."
  - step: 5
    highlight: "Highlight the Payment method dropdown."
  - step: 6
    highlight: "Highlight the Reference no. field."
  - step: 7
    highlight: "Zoom and box the 'Credit account' dropdown — call out that 'Accounts receivable' is the key choice here."
  - step: 8
    highlight: "Highlight the Description cell."
  - step: 9
    highlight: "Highlight the Amount cell."
  - step: 10
    highlight: "Highlight the Memo textarea."
  - step: 11
    highlight: "Box the 'Amount received' figure at the top right."
  - step: 12
    highlight: "Zoom on the 'Save and close' button."
  - step: 13
    highlight: "Circle the new receipt row, then circle the invoice's status badge changing to 'Paid'."
expected_result: "A new receipt for 31,005 XAF from 'Alimentation Baobab Douala' appears at the top of the Receipts list. The customer's outstanding balance decreases by the same amount, and the related sales invoice's status badge changes from 'Unpaid' to 'Paid'."
short_youtube_title: "How to Record a Customer Receipt in BantooBooks"
youtube_description: |
  See how to record money received from a customer in BantooBooks. We call
  this a "Receipt," and it's how you keep your bank balance and customer
  balances accurate and up to date — including automatically marking a
  matching invoice as paid.

  What you'll learn:
  - Why money customers pay you shows up as a "Receipt," not a "Payment," in BantooBooks
  - How to pick the right bank/cash account and credit account
  - How this automatically updates an unpaid invoice to "Paid"
help_center_article: |
  ## Why record customer receipts?

  When a customer pays you, BantooBooks needs to know two things: which bank
  or cash account received the money, and what the money was for. In
  BantooBooks, money coming into your business is recorded as a "Receipt" —
  this is the correct screen to use any time a customer pays you, whether by
  cash, mobile money, bank transfer, or cheque.

  > **Note on terminology:** a **receipt** means money received from a
  > customer. A **payment** means money paid out — for example, to a
  > supplier or for an expense. So to record what most people casually call
  > "a customer payment," you actually use the "Record receipt" action on
  > your dashboard, not "Record payment."

  ## Steps

  From your dashboard, click "Record receipt". Choose the customer under
  "Received from", and the bank or cash account the money went into under
  "Deposit to" — BantooBooks shows you that account's current balance right
  below the dropdown. Set the payment date and method, and optionally a
  reference number for matching against your bank statement later.

  In the "Category details" section, choose "Accounts receivable" as the
  Credit account if this receipt is settling an invoice the customer already
  owes you for. Add a short description, then the amount. Add a Memo for your
  own records if useful, then click "Save and close".

  ## Tip

  If the amount exactly matches an outstanding invoice, that invoice's status
  will automatically change from "Unpaid" to "Paid" once you save the receipt.
guidde_recording_notes: |
  Zoom level: 100%. Record this tutorial right after "Create a sales invoice"
  in the same session/org so the invoice for "Alimentation Baobab Douala" is
  genuinely outstanding and visibly flips to "Paid" at the end — this payoff
  moment is the most convincing part of the video.
  Blur/avoid: don't show the full bank account balance figure zoomed in if it
  reveals other unrelated demo activity; a light blur or a quick cut past it
  is fine, the important thing is that a number is present.
  Pacing: slow down on step 7 (Credit account = Accounts receivable) — this is
  the one field that's easy to get wrong, and worth a full call-out box.
  Click precision: the Category details table only appears when its section
  is expanded; it is expanded by default, but confirm the chevron next to
  "Category details" is pointing down (open) before recording.
synthesia_script: |
  When a customer pays you, BantooBooks calls that a "Receipt" — money coming
  into your business.

  Start a new receipt, and choose which customer paid you.

  Next, choose which bank or cash account the money went into. BantooBooks
  shows you that account's current balance, so you can check it matches what
  you expect.

  Set the date, and how they paid — bank transfer, mobile money, or cash all
  work.

  Then choose "Accounts receivable" as the category. This tells BantooBooks
  the receipt is settling an invoice the customer already owes you for,
  rather than a brand new sale.

  Add a short description and the amount received, then save.

  Once you do, the customer's balance goes down by that amount... and if it
  matches an invoice exactly, that invoice automatically flips from "Unpaid"
  to "Paid." No extra steps needed.
---

# Record a Customer Receipt in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
