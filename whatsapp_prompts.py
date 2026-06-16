"""User-facing WhatsApp copy for the accounting state machine."""

MASTER_MENU = """Thanks {name}. What do you want to do?

1 — 💰 Cash Received (Sales Collection)
2 — 🛑 Cash Expense Made (Outflow)
3 — 🚚 Truck Loading & Delivery Note
4 — 🏦 Bank Deposit / Withdrawal
5 — 🚢 Supplier & Port Payment Confirmation
0 — ❌ Cancel / Start Over

Reply with the number (1–5), or 0 to start over."""

MASTER_MENU_ADMIN = """Thanks {name}. What do you want to do?

1 — 💰 Cash Received (Sales Collection)
2 — 🛑 Cash Expense Made (Outflow)
3 — 🚚 Truck Loading & Delivery Note
4 — 🏦 Bank Deposit / Withdrawal
5 — 🚢 Supplier & Port Payment Confirmation
6 — ➕ Add Client / Supplier (Admin)
0 — ❌ Cancel / Start Over

Reply with the number (1–6), or 0 to start over."""

# Choice 1 — Cash Received
CR_AMOUNT = "Please enter the total amount of physical cash collected (Numbers only)."
PICKER_CLIENT = "Who is the client (buyer)?"
CR_LOCATION = (
    "Where is this cash held?\n"
    "Reply 1 (My Possession), 2 (Warehouse Safe), 3 (Handed to Govind)."
)
CR_PROOF = (
    "Please upload a photo of the Delivery Note, Invoice, or Receipt.\n"
    "Or type 0 if missing."
)
CR_JUSTIFICATION = "Please type a brief reason why paperwork is missing."

# Choice 2 — Expense
EX_AMOUNT = "Enter total cash paid out (Numbers only)."
EX_CATEGORY = (
    "Select category:\n"
    "1 (Fuel), 2 (Warehouse/Logistics), 3 (Labor),\n"
    "4 (Food/Refreshments), 5 (Customs/Admin), 6 (Other)."
)
PICKER_EXPENSE_PARTY = "Who is the supplier or facility for this expense?"
EX_PROOF = "Please upload a sharp photo of the physical receipt, or type 0 if missing."
EX_JUSTIFICATION = "Please type a brief reason why paperwork is missing."

# Choice 3 — Truck / Delivery
TR_TRUCK = "Enter the Truck License Plate Number or Driver Name."
PICKER_TR_CLIENT = "Who is the client for this delivery?"
TR_DOCUMENT = "Enter the associated Delivery Order (DO) or Invoice Number."
TR_STATUS = "Select loading status: 1 (Fully Loaded), 2 (Partial Loading / Shortage)."
TR_SHORTAGE = "Type what items or quantities were short-loaded."
TR_PROOF = "Please upload a photo of the signed Delivery Note (Bon de Livraison)."

# Choice 4 — Bank
BK_TYPE = "Select action: 1 (Cash to Bank Deposit), 2 (Bank to Cash Withdrawal)."
BK_AMOUNT = "Enter the total transaction amount (Numbers only)."
BK_PROOF_DEPOSIT = "Upload a photo of the stamped bank deposit slip (bordereau)."
BK_PROOF_WITHDRAW = "Upload check stub photo or ATM receipt."

# Choice 5 — Supplier
SP_TYPE = (
    "Select payment type:\n"
    "1 (International Food Import Supplier),\n"
    "2 (Local Port / Customs Fees), 3 (Other)."
)
PICKER_SUPPLIER = "Who is the supplier?"
SP_AMOUNT = "Enter total amount paid out from the bank account (Numbers only)."
SP_PROOF = (
    "Upload a photo/screenshot of the bank transfer confirmation or remittance advice."
)

# Admin — add party
AP_TYPE = (
    "Add new name — select type:\n"
    "1 — Client (buyer)\n"
    "2 — Supplier\n"
    "3 — Facility (expense location)"
)
AP_NAME = "Type the exact name to save (spelling will be used in all reports):"
AP_SAVED = "✅ Added *{name}* as {type_label}.\nIt is now available for everyone to select."

# Validation errors
ERR_AMOUNT = "⚠️ Please enter numbers only (e.g. 50000). Try again."
ERR_CHOICE = "⚠️ Invalid choice. {hint}"
ERR_TEXT_REQUIRED = "⚠️ Please type a short answer. Try again."
ERR_PHOTO_REQUIRED = "⚠️ Please send a photo (camera icon), not text."
ERR_PHOTO_OR_ZERO = "⚠️ Send a photo, or type 0 if paperwork is missing."
ERR_UNEXPECTED_PHOTO = "⚠️ A photo is not expected right now.\n\n{prompt}"
ERR_PARTY_PICKER = "⚠️ Reply with a number from the list{extra}."
ERR_ADD_PARTY_DENIED = (
    "⛔ Only Govind, Vikash, or owners can add new clients/suppliers.\n"
    "Please pick from the list or ask them to add the name."
)


def format_master_menu(name: str, *, admin: bool = False) -> str:
    if admin:
        return MASTER_MENU_ADMIN.format(name=name)
    return MASTER_MENU.format(name=name)


def format_saved(receipt_id: str, summary: str, employee_name: str) -> str:
    return (
        f"✅ Saved — Receipt #{receipt_id}\n"
        f"{summary}\n"
        f"Logged by: {employee_name}\n\n"
        "Reply 0 or send any message to return to the main menu."
    )
