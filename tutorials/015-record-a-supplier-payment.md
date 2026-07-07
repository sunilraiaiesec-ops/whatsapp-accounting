---
tutorial_id: record-a-supplier-payment
title: "Record a Supplier Payment in BantooBooks"
feature_area: "Payments"
audience: "Shop owners, distributors, and bookkeepers paying their suppliers"
goal: "Record money paid out to a supplier so their balance goes down and your bank/cash balance goes down too."
prerequisites:
  - "At least one supplier already exists (see 'Create a Supplier in BantooBooks')."
  - "At least one bank or cash account exists (BantooBooks creates a default '1010 — Bank accounts' account for every new organization)."
  - "Optionally, an existing goods receipt or purchase invoice for that supplier (see 'Record a Goods Receipt in BantooBooks') so you can pay down what you owe them."
demo_company: "Central Distribution Cameroon SARL"
test_data:
  paidTo: "Cameroon Beverages Wholesale SARL"
  paidFrom: "1010 — Bank accounts"
  paymentDate: "2026-07-06"
  paymentMethod: "Bank transfer"
  referenceNo: "TRF-90142"
  category: "2000 — Accounts payable"
  lineDescription: "Payment for July stock delivery, ref BL-77029"
  amount: "210,000"
  memo: "Paid in full for July restock delivery."
step_by_step_actions:
  - step: 1
    action: 'On the dashboard, click the "+ Record payment" pill under "Create actions".'
  - step: 2
    action: 'On the New Payment page, open the "Paid to" dropdown and select "Cameroon Beverages Wholesale SARL".'
  - step: 3
    action: 'Open the "Paid from" dropdown and select "1010 — Bank accounts". Note the account balance shown just below it.'
  - step: 4
    action: 'Confirm "Payment date" already shows today''s date.'
  - step: 5
    action: 'Open the "Payment method" dropdown and select "Bank transfer".'
  - step: 6
    action: 'Type "TRF-90142" into "Ref no.".'
  - step: 7
    action: 'In the "Category details" table, open the "Category" dropdown on the first row and select "2000 — Accounts payable" — this tells BantooBooks the money is settling stock you already received, not a brand-new expense.'
  - step: 8
    action: 'Type "Payment for July stock delivery, ref BL-77029" into the "Description" cell for that line.'
  - step: 9
    action: 'Type "210,000" into the "Amount" cell for that line.'
  - step: 10
    action: 'Type "Paid in full for July restock delivery." into the "Memo" field.'
  - step: 11
    action: 'Confirm "Total" at the top right shows "210,000".'
  - step: 12
    action: 'Click "Save and close".'
  - step: 13
    action: 'Confirm the new payment appears at the top of the Payments list.'
screen_to_show:
  - step: 1
    screen: "The BantooBooks dashboard, showing the 'Create actions' row."
  - step: 2
    screen: "The New Payment page (/payments/new), top section with 'Paid to' dropdown open."
  - step: 3
    screen: "The 'Paid from' dropdown, with the account balance label visible underneath once selected."
  - step: 4
    screen: "The Payment date field."
  - step: 5
    screen: "The Payment method dropdown."
  - step: 6
    screen: "The Ref no. field."
  - step: 7
    screen: "The 'Category details' table, Category dropdown on the first row."
  - step: 8
    screen: "The 'Category details' table, Description cell."
  - step: 9
    screen: "The 'Category details' table, Amount cell (right-aligned)."
  - step: 10
    screen: "The Memo textarea near the bottom of the form."
  - step: 11
    screen: "The 'Total' figure shown at the top right of the form card."
  - step: 12
    screen: "The bottom action bar with 'Print' and 'Save and close' buttons."
  - step: 13
    screen: "The Payments list page (/payments), showing the new row."
voiceover_script:
  - step: 1
    line: "When you pay a supplier, we record that as a payment — money going out of your business. Tap 'Record payment' on your dashboard."
  - step: 2
    line: "Choose who you paid — here it's 'Cameroon Beverages Wholesale SARL'."
  - step: 3
    line: "Choose which bank or cash account the money left from. BantooBooks shows you that account's current balance right underneath, so you can double check."
  - step: 4
    line: "The date defaults to today, which is usually correct."
  - step: 5
    line: "Pick how you paid — bank transfer, mobile money, cash, whatever fits."
  - step: 6
    line: "If you have a transfer reference, add it here — handy for matching against your bank statement later."
  - step: 7
    line: "This part matters: choose 'Accounts payable' here, because this payment is settling stock you already received from this supplier — not a brand new expense."
  - step: 8
    line: "Add a short note about what this payment is for."
  - step: 9
    line: "Enter the amount you paid."
  - step: 10
    line: "You can add one more note for your own records here too."
  - step: 11
    line: "Double check the total matches what you actually paid."
  - step: 12
    line: "Tap 'Save and close' to record the payment."
  - step: 13
    line: "And that's it — the payment is saved, your bank balance goes down, and this supplier's balance goes down by the same amount."
on_screen_highlights:
  - step: 1
    highlight: "Circle the '+ Record payment' pill in the Create actions row."
  - step: 2
    highlight: "Zoom on the 'Paid to' dropdown and selected name."
  - step: 3
    highlight: "Highlight the 'Paid from' dropdown and the balance label that appears below it."
  - step: 4
    highlight: "Highlight the Payment date field."
  - step: 5
    highlight: "Highlight the Payment method dropdown."
  - step: 6
    highlight: "Highlight the Ref no. field."
  - step: 7
    highlight: "Zoom and box the 'Category' dropdown — call out that 'Accounts payable' is the key choice here."
  - step: 8
    highlight: "Highlight the Description cell."
  - step: 9
    highlight: "Highlight the Amount cell."
  - step: 10
    highlight: "Highlight the Memo textarea."
  - step: 11
    highlight: "Box the 'Total' figure at the top right."
  - step: 12
    highlight: "Zoom on the 'Save and close' button on click."
  - step: 13
    highlight: "Circle the new payment row."
expected_result: "A new payment of 210,000 XAF to 'Cameroon Beverages Wholesale SARL' appears at the top of the Payments list. The Bank accounts balance decreases by 210,000 XAF, and this supplier's outstanding balance (Accounts Payable) decreases by the same amount."
short_youtube_title: "How to Record a Supplier Payment in BantooBooks"
youtube_description: |
  See how to record money paid out to a supplier in BantooBooks. We call
  this a "Payment," and it's how you keep your bank balance and supplier
  balances accurate — reducing exactly what you owe them.

  What you'll learn:
  - Where to find "Record payment" from your dashboard
  - How to pick the right bank/cash account and category
  - How choosing "Accounts payable" settles stock you already received
help_center_article: |
  ## Why record supplier payments?

  When you pay a supplier, BantooBooks needs to know two things: which
  bank or cash account the money left from, and what the payment was for.
  In BantooBooks, money going out of your business is recorded as a
  "Payment" — this is the right screen to use whenever you pay a supplier,
  whether by cash, mobile money, bank transfer, or cheque.

  ## Steps

  From your dashboard, click "Record payment". Choose the supplier under
  "Paid to", and the bank or cash account the money left from under "Paid
  from" — BantooBooks shows you that account's current balance right below
  the dropdown. Set the payment date and method, and optionally a reference
  number for matching against your bank statement later.

  In the "Category details" section, choose "Accounts payable" as the
  Category if this payment is settling stock or a bill you already owe this
  supplier for. Add a short description, then the amount. Add a Memo for
  your own records if useful, then click "Save and close".

  ## Tip

  If you're paying for a brand-new cost rather than settling an existing
  bill — like a one-off delivery fee you were never invoiced for — choose
  the matching expense account (like "Transport & fuel") instead of
  "Accounts payable".
guidde_recording_notes: |
  Zoom level: 100%. Record this right after "Record a goods receipt" for the
  same supplier so the payment genuinely settles real stock received, and
  the story of "receive stock, then pay for it" reads naturally.
  Blur/avoid: don't show the full bank account balance figure zoomed in if
  it reveals other unrelated demo activity; a light blur or a quick cut past
  it is fine, the important thing is that a number is present.
  Pacing: slow down on step 7 (Category = Accounts payable) — this is the
  field that's easy to get wrong, and worth a full call-out box.
  Click precision: the Category details table is expanded by default;
  confirm the chevron next to "Category details" is pointing down (open)
  before recording.
synthesia_script: |
  When you pay a supplier, BantooBooks calls that a "Payment" — money going
  out of your business.

  Start a new payment, and choose which supplier you paid.

  Next, choose which bank or cash account the money left from. BantooBooks
  shows you that account's current balance, so you can check it matches
  what you expect.

  Set the date, and how you paid — bank transfer, mobile money, or cash all
  work.

  Then choose "Accounts payable" as the category. This tells BantooBooks
  the payment is settling stock or a bill you already owe this supplier
  for, rather than a brand new expense.

  Add a short description and the amount paid, then save.

  Once you do, your bank balance goes down by that amount... and the
  supplier's balance goes down too, keeping everything accurate.
---

# Record a Supplier Payment in BantooBooks

See the frontmatter above for the full structured tutorial content (steps, voiceover, help-center article, and recording scripts).
