export type CommandIntent =
  | "create_receipt"
  | "create_payment"
  | "create_goods_receipt"
  | "create_customer"
  | "customer_action"
  | "supplier_action"
  | "unknown";

// Every non-creation customer workflow Ask Bantoo can recognize by rule. The
// "unsupported_*" members exist so archive/reactivate/merge/upload-document
// commands are classified confidently (not "unknown") and routed to the
// standard "not available yet" response, instead of surfacing a misleading
// low-confidence guess.
export type CustomerActionKind =
  | "edit"
  | "view_profile"
  | "view_ledger"
  | "view_statement"
  | "view_documents"
  | "view_list"
  | "balance"
  | "add_note"
  | "contact_call"
  | "contact_whatsapp"
  | "contact_email"
  | "query"
  | "unsupported_archive"
  | "unsupported_reactivate"
  | "unsupported_merge"
  | "unsupported_upload_document";

export type ParsedCustomerAction = {
  kind: CustomerActionKind;
  customerName: string | null;
  // Only set for "unsupported_merge" — the second party to merge into/with.
  secondCustomerName: string | null;
  // Only set for "add_note".
  note: string | null;
  // Only set for "edit" — updates to apply, when present in the command text.
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  // Only set for "view_statement" and "query" — raw phrase like "June" or
  // "last month", resolved to an actual date range by resolvePeriodToRange.
  periodText: string | null;
  // Only set for "query" — the free-text question, for the summary/answer.
  question: string | null;
};

// Every non-transactional supplier workflow Ask Bantoo can recognize by
// rule — the Supplier & Purchasing Intelligence Sprint mirror of
// CustomerActionKind above. There is deliberately no "view_statement": unlike
// customers, there is no single-supplier statement report page (see
// lib/ai/actions.ts's supplierViewTarget comment for details).
export type SupplierActionKind =
  | "edit"
  | "view_profile"
  | "view_ledger"
  | "view_documents"
  | "view_list"
  | "balance"
  | "add_note"
  | "contact_call"
  | "contact_whatsapp"
  | "contact_email"
  | "query"
  | "unsupported_archive"
  | "unsupported_reactivate"
  | "unsupported_merge"
  | "unsupported_upload_document";

export type ParsedSupplierAction = {
  kind: SupplierActionKind;
  supplierName: string | null;
  // Only set for "unsupported_merge" — the second party to merge into/with.
  secondSupplierName: string | null;
  // Only set for "add_note".
  note: string | null;
  // Only set for "edit" — updates to apply, when present in the command text.
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  // Only set for "query" — raw phrase like "last month", resolved to an
  // actual date range by resolvePeriodToRange.
  periodText: string | null;
  // Only set for "query" — the free-text question, for the summary/answer.
  question: string | null;
};

// Every sales-document workflow Ask Bantoo can recognize by rule (Sales
// Intelligence Sprint) — single-line/lump-sum documents only (see
// lib/bantoo/resolve.ts's "sales_invoice"/"credit_note"/"refund_receipt"
// cases), never multi-line itemized invoicing via chat. The "unsupported_*"
// members exist so genuinely-not-buildable commands (editing/voiding/
// emailing an existing invoice, applying a payment to one specific invoice
// number) are classified confidently instead of "unknown". "view_list" is
// intentionally the only view target — there is no per-customer sales
// invoice filter on /sales-invoices yet, so a name-specific "view" would be
// misleading; that's a documented MVP limitation, not an oversight.
export type SalesActionKind =
  | "invoice"
  | "credit_note"
  | "refund"
  | "view_list"
  | "unsupported_edit"
  | "unsupported_void"
  | "unsupported_email"
  | "unsupported_apply_payment";

export type ParsedSalesAction = {
  kind: SalesActionKind;
  customerName: string | null;
  // Only set for "invoice"/"credit_note"/"refund" when a "for X"/"pour X"
  // clause is present after the amount.
  description: string | null;
  // Only set for "invoice" — parsed from "due in 30 days" / "net 30" /
  // "échéance dans 30 jours". The caller resolves this to a concrete ISO date.
  dueDateDays: number | null;
  // Only set for the unsupported_* kinds — the referenced invoice/document
  // number, when present in the command text.
  invoiceNumber: string | null;
};

export type PaymentCategory = "supplier" | "expense";
export type ReceiptCategory = "customer" | "sales";

export type ParsedCommand = {
  intent: CommandIntent;
  amountText: string | null;
  quantityText: string | null;
  quantityUnit: string | null;
  itemDescription: string | null;
  partyName: string | null;
  city: string | null;
  expenseDescription: string | null;
  paymentCategory: PaymentCategory | null;
  receiptCategory: ReceiptCategory | null;
  // Populated only when intent === "customer_action".
  customerAction: ParsedCustomerAction | null;
  // Populated only when intent === "supplier_action".
  supplierAction: ParsedSupplierAction | null;
  // Multi-step Task Planning: best-effort rule-based extraction of the same
  // extra fields the AI path captures for create_customer (see
  // extractCreateCustomerDetails) — a simple compound sentence like "Add
  // Musa as a customer in Garoua, phone 690123456" should work without AI.
  // Only populated when intent === "create_customer"; more complex phrasing
  // (e.g. notes, pronoun resolution) is left to the AI path.
  phone: string | null;
  whatsapp: string | null;
  postAction: "open_profile" | null;
  raw: string;
};

export type LegacyCommandIntent = Exclude<
  CommandIntent,
  "create_customer" | "customer_action" | "supplier_action"
>;

export type LegacyParsedCommand = {
  intent: LegacyCommandIntent;
  amountText: string | null;
  quantityText: string | null;
  quantityUnit: string | null;
  itemDescription: string | null;
  partyName: string | null;
  city: string | null;
  expenseDescription: string | null;
  paymentCategory: PaymentCategory | null;
  receiptCategory: ReceiptCategory | null;
  raw: string;
};

const RECEIPT_PATTERNS = [
  /\b(received?|receive|reçu|recu|encaiss(?:é|e|ement)?|got)\b/i,
  /\brecord\s+receipt\b/i,
  /\breceipt\b.+\b(?:from|de|client|customer|by)\b/i,
  /\b(?:from|de|client|customer|by)\b.+\breceipt\b/i,
  /\b(milli|mila|mile|mili|mil gayi|mil gaya|mil gaye|mil gya)\b/i,
  /\b(aaya|aya|aayi|aaye)\b/i,
  /\bpayment\s+(?:milli|mila|mili|received|aayi|aaya|mil gayi|mil gaya)\b/i,
  /\b(humko|hame|humein|humne)\b.+\b(milli|mila|mili|aaya|aya)\b/i,
];

const STOCK_RECEIPT_PATTERNS = [
  /\b(received?|receive|got|reçu|recu|entr(?:ée|e)|stock)\b/i,
  /\b(mila|milli|aaya|aya)\b/i,
];

const PAYMENT_PATTERNS = [
  /\b(paid?|pay|payé|paye|décaiss(?:é|e|ement)?|decaiss(?:é|e|ement)?|sent)\b/i,
  /\b(diya|diye|di gayi|de diya|de diye|bheja|bheje|pay kiya|pay kar diya)\b/i,
  /\bpaid\s+to\b/i,
  /\bpay\s+(?:to|ko)\b/i,
];

const HINDI_FROM_SUFFIX =
  /\b([a-z][a-z\s.'-]{1,80}?)\s+(?:say|se|ki taraf se)\s*$/i;

const QUANTITY_PATTERN =
  /(\d[\d\s,.'']*(?:\.\d+)?)\s*(bags?|units?|unités?|kg|kilos?|kilogrammes?|tons?|tonnes?|cartons?|pieces?|pièces?|sacks?|sacs?|boxes?|boîtes?|crates?|pallets?|liters?|litres?|pcs|sachets?)\b/i;

const CURRENCY_PATTERN = /\b(xaf|fcfa|francs?|cfa)\b/i;
const MONEY_MODIFIER_PATTERN = /\b(million|millions|mio|\bm\b)\b/i;

const FROM_PATTERN =
  /\b(?:from|de|du|de la|des|customer|client|by)\s+(.+?)(?:\s+(?:for|pour|on|le|today|hier|yesterday)|$)/i;

const TO_PARTY_PATTERN =
  /\b(?:to|à|au|a|supplier|fournisseur|vendor)\s+(.+?)(?:\s+(?:for|pour|on|le|today|hier|yesterday)|$)/i;

const FOR_REASON_PATTERN = /\b(?:for|pour)\s+(.+)$/i;

const CREATE_CUSTOMER_PATTERNS = [
  /\b(?:add|create|new)\s+(?:a\s+)?customers?\b/i,
  /\b(?:ajouter|créer|creer|nouveau)\s+(?:un\s+)?clients?\b/i,
  /\b(?:add|ajouter)\s+.+\s+(?:as\s+(?:a\s+)?(?:customer|client)|comme\s+client)\b/i,
  /\b(?:add|ajouter)\s+clients?\s+\S/i,
  /\bclients?\s+(?:nommé|nomme|named|called|appelé|appele|appellé)\b/i,
];

const CUSTOMER_NAME_LEAD =
  /^(?:nommé|nomme|named|called|appelé|appele|appellé)\s+/i;

// ---------------------------------------------------------------------------
// Customer-action detection (Ask Bantoo Customer Intelligence Sprint).
// Every pattern below deliberately requires the literal word
// "customer"/"client" so a parallel supplier command (e.g. "Call supplier
// Adamou") never gets misclassified — see the "customer vs supplier
// confusion" regression tests. Patterns are tried in priority order (most
// specific first) so e.g. "merge" is never swallowed by the generic
// edit/view patterns.
// ---------------------------------------------------------------------------

const PERIOD_TAIL = /\s+(?:for|pour)\s+(.+)$/i;

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[?.!]+\s*$/g, "").trim();
}

function cleanPartyNameGeneric(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[:,-]+/, "").trim();
  s = s.replace(/['’]s$/i, "").trim();
  s = stripTrailingPunctuation(s);
  return cleanLabel(s);
}

function cleanCustomerName(raw: string): string {
  return cleanPartyNameGeneric(raw);
}

function cleanSupplierName(raw: string): string {
  return cleanPartyNameGeneric(raw);
}

// Splits a captured tail like "Musa for June" into { name: "Musa", period:
// "June" }. When there is no " for "/" pour " clause, period is null.
function splitNameAndPeriod(tail: string): { name: string; period: string | null } {
  const m = tail.match(PERIOD_TAIL);
  if (m?.[1]) {
    return {
      name: cleanCustomerName(tail.slice(0, m.index)),
      period: stripTrailingPunctuation(m[1]),
    };
  }
  return { name: cleanCustomerName(tail), period: null };
}

function parseEditFieldsTail(
  tail: string,
  cleanName: (raw: string) => string,
): {
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
} {
  const colonIndex = tail.indexOf(":");
  const namePart = colonIndex >= 0 ? tail.slice(0, colonIndex) : tail;
  const fieldsText = colonIndex >= 0 ? tail.slice(colonIndex + 1).trim() : "";
  const name = cleanName(namePart);

  let phone: string | null = null;
  let whatsapp: string | null = null;
  let email: string | null = null;
  let city: string | null = null;

  if (fieldsText) {
    const emailMatch = fieldsText.match(/\bemail\s+([^\s,;]+@[^\s,;]+)/i);
    if (emailMatch?.[1]) email = emailMatch[1].trim();

    const waMatch = fieldsText.match(/\bwhatsapp\s+([+\d][\d\s-]{4,}?)(?:[,;]|$)/i);
    if (waMatch?.[1]) whatsapp = waMatch[1].trim();

    const phoneMatch = fieldsText.match(/\b(?:phone|t[ée]l[ée]phone|tel)\s+([+\d][\d\s-]{4,}?)(?:[,;]|$)/i);
    if (phoneMatch?.[1]) phone = phoneMatch[1].trim();

    const cityMatch = fieldsText.match(/\b(?:city|ville)\s+([^,;]+?)(?:[,;]|$)/i);
    if (cityMatch?.[1]) city = cityMatch[1].trim();
  }

  return { name, phone, whatsapp, email, city };
}

function parseEditTail(tail: string) {
  return parseEditFieldsTail(tail, cleanCustomerName);
}

function parseSupplierEditTail(tail: string) {
  return parseEditFieldsTail(tail, cleanSupplierName);
}

// Ordered most-specific-first: merge/archive/reactivate/upload before the
// generic edit/view/search patterns so they never get shadowed.
const CUSTOMER_UNSUPPORTED_MERGE = [
  /\bmerge\s+(?:duplicate\s+)?customers?\s+(.+?)\s+(?:and|with)\s+(.+)$/i,
  /\bfusionner\s+(?:les\s+)?clients?\s+(.+?)\s+(?:et|avec)\s+(.+)$/i,
];

const CUSTOMER_UNSUPPORTED_ARCHIVE = [
  /\barchive\s+customer\s+(.+)$/i,
  /\barchiver\s+(?:le\s+)?client\s+(.+)$/i,
];

const CUSTOMER_UNSUPPORTED_REACTIVATE = [
  /\breactivate\s+customer\s+(.+)$/i,
  /\br[ée]activer\s+(?:le\s+)?client\s+(.+)$/i,
];

const CUSTOMER_UNSUPPORTED_UPLOAD = [
  /\bupload\s+(?:a\s+)?document\s+(?:for|to)\s+customer\s+(.+)$/i,
  /\b(?:t[ée]l[ée]verser|t[ée]l[ée]charger|importer)\s+(?:un\s+)?document\s+(?:pour|au)\s+client\s+(.+)$/i,
];

const CUSTOMER_ADD_NOTE = [
  /\badd\s+(?:a\s+)?note\s+(?:to|for)\s+customer\s+(.+?)\s*:\s*(.+)$/i,
  /\bajouter\s+(?:une\s+)?note\s+(?:au|pour\s+le|pour)\s+client\s+(.+?)\s*:\s*(.+)$/i,
];

const CUSTOMER_BALANCE = [
  /\bwhat(?:'s|\s+is)\s+(.+?)'s\s+outstanding\s+balance\b/i,
  /\bhow\s+much\s+does\s+(.+?)\s+owe\b/i,
  /\b(?:show|view|get)\s+outstanding\s+balance\s+for\s+customer\s+(.+)$/i,
  /\bquel\s+est\s+le\s+solde\s+impay[ée]\s+de\s+(.+?)\s*\??$/i,
  /\bcombien\s+(.+?)\s+doit(?:-il|-elle)?\s*\??$/i,
];

const CUSTOMER_STATEMENT = [
  /\bshow\s+(.+?)'s\s+statement(?:\s+for\s+(.+))?$/i,
  /\bgenerate\s+(?:customer\s+)?statement\s+for\s+(?:customer\s+)?(.+)$/i,
  /\bcustomer\s+statement\s+for\s+(.+)$/i,
  /\bg[ée]n[ée]rer\s+le\s+relev[ée]\s+(?:client\s+)?de\s+(.+)$/i,
  /\brelev[ée]\s+client\s+de\s+(.+)$/i,
];

const CUSTOMER_LEDGER = [
  /\bshow\s+(.+?)'s\s+ledger\b/i,
  /\b(?:open|view)\s+customer\s+ledger\s+for\s+(.+)$/i,
  /\bview\s+(.+?)'s\s+transactions\b/i,
  /\bafficher\s+le\s+grand\s+livre\s+(?:client\s+)?de\s+(.+)$/i,
  /\bvoir\s+les\s+transactions\s+de\s+(.+)$/i,
];

const CUSTOMER_DOCUMENTS = [
  /\bshow\s+documents\s+for\s+customer\s+(.+)$/i,
  /\bopen\s+(.+?)'s\s+documents\b/i,
  /\bafficher\s+les\s+documents\s+du\s+client\s+(.+)$/i,
];

const CUSTOMER_PROFILE = [
  /\bopen\s+(.+?)'s\s+profile\b/i,
  /\bshow\s+customer\s+profile\s+for\s+(.+)$/i,
  /\bview\s+customer\s+(.+)$/i,
  /\bouvrir\s+la\s+fiche\s+client\s+de\s+(.+)$/i,
  /\bafficher\s+le\s+profil\s+(?:du\s+client\s+|de\s+)(.+)$/i,
];

const CUSTOMER_SEARCH_NAMED = [
  /\b(?:search|find)\s+customer\s+(.+)$/i,
  /\b(?:rechercher|chercher)\s+(?:le\s+)?client\s+(.+)$/i,
];

const CUSTOMER_SEARCH_BARE = [
  /^\s*search\s+customers?\s*$/i,
  /^\s*(?:rechercher|chercher)\s+(?:des\s+)?clients?\s*$/i,
];

const CUSTOMER_CALL = [
  /\bcall\s+customer\s+(.+)$/i,
  /\bappeler\s+(?:le\s+)?client\s+(.+)$/i,
];

const CUSTOMER_WHATSAPP = [
  /\b(?:whatsapp|send\s+(?:a\s+)?whatsapp(?:\s+message)?\s+to)\s+customer\s+(.+)$/i,
  /\bwhatsapp\s+client\s+(.+)$/i,
  /\benvoyer\s+un\s+whatsapp\s+(?:au|à\s+la|à)\s+client\s+(.+)$/i,
];

const CUSTOMER_EMAIL = [
  /\b(?:email|send\s+(?:an\s+)?email\s+to)\s+customer\s+(.+)$/i,
  /\bemail\s+client\s+(.+)$/i,
  /\benvoyer\s+un\s+email\s+au\s+client\s+(.+)$/i,
];

const CUSTOMER_EDIT = [
  /\b(?:edit|update|modify)\s+customer\s+(.+)$/i,
  /\b(?:modifier|mettre\s+à\s+jour|mettre\s+a\s+jour)\s+(?:le\s+)?client\s+(.+)$/i,
];

const CUSTOMER_QUERY = [
  /\bwhat\s+did\s+(.+?)\s+buy\s+(.+?)\??$/i,
  /\bwhat\s+has\s+(.+?)\s+purchased\s+(.+?)\??$/i,
  /\bqu['’]est-ce\s+que\s+(.+?)\s+a\s+achet[ée]\s+(.+?)\??$/i,
];

function firstMatch(patterns: RegExp[], text: string): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}

function detectCustomerAction(raw: string): ParsedCustomerAction | null {
  let m = firstMatch(CUSTOMER_UNSUPPORTED_MERGE, raw);
  if (m?.[1] && m[2]) {
    return {
      kind: "unsupported_merge",
      customerName: cleanCustomerName(m[1]),
      secondCustomerName: cleanCustomerName(m[2]),
      note: null,
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      periodText: null,
      question: null,
    };
  }

  const emptyExtras = {
    secondCustomerName: null,
    note: null,
    phone: null,
    whatsapp: null,
    email: null,
    city: null,
    periodText: null,
    question: null,
  } as const;

  m = firstMatch(CUSTOMER_UNSUPPORTED_ARCHIVE, raw);
  if (m?.[1]) {
    return { kind: "unsupported_archive", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_UNSUPPORTED_REACTIVATE, raw);
  if (m?.[1]) {
    return { kind: "unsupported_reactivate", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_UNSUPPORTED_UPLOAD, raw);
  if (m?.[1]) {
    return { kind: "unsupported_upload_document", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_ADD_NOTE, raw);
  if (m?.[1] && m[2]) {
    return {
      kind: "add_note",
      customerName: cleanCustomerName(m[1]),
      note: stripTrailingPunctuation(m[2]),
      secondCustomerName: null,
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      periodText: null,
      question: null,
    };
  }

  m = firstMatch(CUSTOMER_BALANCE, raw);
  if (m?.[1]) {
    return { kind: "balance", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_STATEMENT, raw);
  if (m?.[1]) {
    const { name, period } = splitNameAndPeriod(m[2] ? `${m[1]} for ${m[2]}` : m[1]);
    return { kind: "view_statement", customerName: name, ...emptyExtras, periodText: period };
  }

  m = firstMatch(CUSTOMER_LEDGER, raw);
  if (m?.[1]) {
    return { kind: "view_ledger", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_DOCUMENTS, raw);
  if (m?.[1]) {
    return { kind: "view_documents", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_QUERY, raw);
  if (m?.[1]) {
    return {
      kind: "query",
      customerName: cleanCustomerName(m[1]),
      ...emptyExtras,
      periodText: m[2] ? stripTrailingPunctuation(m[2]) : null,
      question: raw.trim(),
    };
  }

  m = firstMatch(CUSTOMER_CALL, raw);
  if (m?.[1]) {
    return { kind: "contact_call", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_WHATSAPP, raw);
  if (m?.[1]) {
    return { kind: "contact_whatsapp", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_EMAIL, raw);
  if (m?.[1]) {
    return { kind: "contact_email", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_EDIT, raw);
  if (m?.[1]) {
    const parsed = parseEditTail(m[1]);
    return {
      kind: "edit",
      customerName: parsed.name,
      ...emptyExtras,
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      email: parsed.email,
      city: parsed.city,
    };
  }

  m = firstMatch(CUSTOMER_PROFILE, raw);
  if (m?.[1]) {
    return { kind: "view_profile", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  m = firstMatch(CUSTOMER_SEARCH_NAMED, raw);
  if (m?.[1]) {
    return { kind: "view_profile", customerName: cleanCustomerName(m[1]), ...emptyExtras };
  }

  if (firstMatch(CUSTOMER_SEARCH_BARE, raw)) {
    return { kind: "view_list", customerName: null, ...emptyExtras };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Supplier-action detection (Ask Bantoo Supplier & Purchasing Intelligence
// Sprint). Mirror image of the customer-action block above: every pattern
// below deliberately requires the literal word "supplier"/"fournisseur" so a
// parallel customer command (e.g. "Call customer Adamou") never gets
// misclassified here — see the "customer vs supplier confusion" regression
// tests in lib/command-parse-supplier.test.ts. There is deliberately no
// "view_statement" kind (see SupplierActionKind's doc comment).
//
// Note on supplier_query: the free-text phrasing shown in product examples
// ("what did we buy from Elhaji last month") does NOT literally contain the
// word "supplier" — that natural phrasing is handled by the AI extraction
// path (lib/ai/extract.ts), which has no collision risk since it reasons
// about full intent rather than matching regexes. This rule-based fallback
// deliberately requires "supplier"/"fournisseur" explicitly so it can never
// be confused with a CUSTOMER_QUERY match on the same sentence structure.
// ---------------------------------------------------------------------------

const SUPPLIER_UNSUPPORTED_MERGE = [
  /\bmerge\s+(?:duplicate\s+)?suppliers?\s+(.+?)\s+(?:and|with)\s+(.+)$/i,
  /\bfusionner\s+(?:les\s+)?fournisseurs?\s+(.+?)\s+(?:et|avec)\s+(.+)$/i,
];

const SUPPLIER_UNSUPPORTED_ARCHIVE = [
  /\barchive\s+supplier\s+(.+)$/i,
  /\barchiver\s+(?:le\s+)?fournisseur\s+(.+)$/i,
];

const SUPPLIER_UNSUPPORTED_REACTIVATE = [
  /\breactivate\s+supplier\s+(.+)$/i,
  /\br[ée]activer\s+(?:le\s+)?fournisseur\s+(.+)$/i,
];

const SUPPLIER_UNSUPPORTED_UPLOAD = [
  /\bupload\s+(?:a\s+)?document\s+(?:for|to)\s+supplier\s+(.+)$/i,
  /\b(?:t[ée]l[ée]verser|t[ée]l[ée]charger|importer)\s+(?:un\s+)?document\s+(?:pour|au)\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_ADD_NOTE = [
  /\badd\s+(?:a\s+)?note\s+(?:to|for)\s+supplier\s+(.+?)\s*:\s*(.+)$/i,
  /\bajouter\s+(?:une\s+)?note\s+(?:au|pour\s+le|pour)\s+fournisseur\s+(.+?)\s*:\s*(.+)$/i,
];

const SUPPLIER_BALANCE = [
  /\bwhat(?:'s|\s+is)\s+(?:our\s+)?balance\s+with\s+supplier\s+(.+?)\??$/i,
  /\bhow\s+much\s+do\s+we\s+owe\s+supplier\s+(.+?)\??$/i,
  /\b(?:show|view|get)\s+outstanding\s+balance\s+for\s+supplier\s+(.+)$/i,
  /\bquel\s+est\s+(?:notre\s+)?solde\s+(?:avec|pour)\s+(?:le\s+)?fournisseur\s+(.+?)\s*\??$/i,
  /\bcombien\s+devons[- ]nous\s+au\s+fournisseur\s+(.+?)\s*\??$/i,
];

const SUPPLIER_LEDGER = [
  /\bshow\s+supplier\s+(.+?)'s\s+ledger\b/i,
  /\b(?:open|view)\s+supplier\s+ledger\s+for\s+(.+)$/i,
  /\bview\s+supplier\s+(.+?)'s\s+transactions\b/i,
  /\bafficher\s+le\s+grand\s+livre\s+fournisseur\s+de\s+(.+)$/i,
  /\bvoir\s+les\s+transactions\s+du\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_DOCUMENTS = [
  /\bshow\s+documents\s+for\s+supplier\s+(.+)$/i,
  /\bopen\s+supplier\s+(.+?)'s\s+documents\b/i,
  /\bafficher\s+les\s+documents\s+du\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_PROFILE = [
  /\bopen\s+supplier\s+(.+?)'s\s+profile\b/i,
  /\bshow\s+supplier\s+profile\s+for\s+(.+)$/i,
  /\bview\s+supplier\s+(.+)$/i,
  /\bouvrir\s+la\s+fiche\s+fournisseur\s+de\s+(.+)$/i,
  /\bafficher\s+le\s+profil\s+du\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_SEARCH_NAMED = [
  /\b(?:search|find)\s+supplier\s+(.+)$/i,
  /\b(?:rechercher|chercher)\s+(?:le\s+)?fournisseur\s+(.+)$/i,
];

const SUPPLIER_SEARCH_BARE = [
  /^\s*search\s+suppliers?\s*$/i,
  /^\s*(?:rechercher|chercher)\s+(?:des\s+)?fournisseurs?\s*$/i,
];

const SUPPLIER_CALL = [
  /\bcall\s+supplier\s+(.+)$/i,
  /\bappeler\s+(?:le\s+)?fournisseur\s+(.+)$/i,
];

const SUPPLIER_WHATSAPP = [
  /\b(?:whatsapp|send\s+(?:a\s+)?whatsapp(?:\s+message)?\s+to)\s+supplier\s+(.+)$/i,
  /\bwhatsapp\s+fournisseur\s+(.+)$/i,
  /\benvoyer\s+un\s+whatsapp\s+(?:au|à\s+la|à)\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_EMAIL = [
  /\b(?:email|send\s+(?:an\s+)?email\s+to)\s+supplier\s+(.+)$/i,
  /\bemail\s+fournisseur\s+(.+)$/i,
  /\benvoyer\s+un\s+email\s+au\s+fournisseur\s+(.+)$/i,
];

const SUPPLIER_EDIT = [
  /\b(?:edit|update|modify)\s+supplier\s+(.+)$/i,
  /\b(?:modifier|mettre\s+à\s+jour|mettre\s+a\s+jour)\s+(?:le\s+)?fournisseur\s+(.+)$/i,
];

const SUPPLIER_QUERY = [
  /\bwhat\s+did\s+we\s+buy\s+from\s+supplier\s+(.+?)\s+(.+?)\??$/i,
  /\bwhat\s+did\s+we\s+buy\s+from\s+supplier\s+(.+?)\??$/i,
  /\bwhat\s+have\s+we\s+(?:bought|purchased)\s+from\s+supplier\s+(.+?)\s+(.+?)\??$/i,
  /\bwhat\s+have\s+we\s+(?:bought|purchased)\s+from\s+supplier\s+(.+?)\??$/i,
  /\bqu['’]avons-nous\s+achet[ée]\s+(?:chez|au|du)\s+(?:le\s+)?fournisseur\s+(.+?)\s+(.+?)\??$/i,
  /\bqu['’]avons-nous\s+achet[ée]\s+(?:chez|au|du)\s+(?:le\s+)?fournisseur\s+(.+?)\??$/i,
];

function detectSupplierAction(raw: string): ParsedSupplierAction | null {
  let m = firstMatch(SUPPLIER_UNSUPPORTED_MERGE, raw);
  if (m?.[1] && m[2]) {
    return {
      kind: "unsupported_merge",
      supplierName: cleanSupplierName(m[1]),
      secondSupplierName: cleanSupplierName(m[2]),
      note: null,
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      periodText: null,
      question: null,
    };
  }

  const emptyExtras = {
    secondSupplierName: null,
    note: null,
    phone: null,
    whatsapp: null,
    email: null,
    city: null,
    periodText: null,
    question: null,
  } as const;

  m = firstMatch(SUPPLIER_UNSUPPORTED_ARCHIVE, raw);
  if (m?.[1]) {
    return { kind: "unsupported_archive", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_UNSUPPORTED_REACTIVATE, raw);
  if (m?.[1]) {
    return { kind: "unsupported_reactivate", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_UNSUPPORTED_UPLOAD, raw);
  if (m?.[1]) {
    return { kind: "unsupported_upload_document", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_ADD_NOTE, raw);
  if (m?.[1] && m[2]) {
    return {
      kind: "add_note",
      supplierName: cleanSupplierName(m[1]),
      note: stripTrailingPunctuation(m[2]),
      secondSupplierName: null,
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      periodText: null,
      question: null,
    };
  }

  m = firstMatch(SUPPLIER_BALANCE, raw);
  if (m?.[1]) {
    return { kind: "balance", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_LEDGER, raw);
  if (m?.[1]) {
    return { kind: "view_ledger", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_DOCUMENTS, raw);
  if (m?.[1]) {
    return { kind: "view_documents", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_QUERY, raw);
  if (m?.[1]) {
    return {
      kind: "query",
      supplierName: cleanSupplierName(m[1]),
      ...emptyExtras,
      periodText: m[2] ? stripTrailingPunctuation(m[2]) : null,
      question: raw.trim(),
    };
  }

  m = firstMatch(SUPPLIER_CALL, raw);
  if (m?.[1]) {
    return { kind: "contact_call", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_WHATSAPP, raw);
  if (m?.[1]) {
    return { kind: "contact_whatsapp", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_EMAIL, raw);
  if (m?.[1]) {
    return { kind: "contact_email", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_EDIT, raw);
  if (m?.[1]) {
    const parsed = parseSupplierEditTail(m[1]);
    return {
      kind: "edit",
      supplierName: parsed.name,
      ...emptyExtras,
      phone: parsed.phone,
      whatsapp: parsed.whatsapp,
      email: parsed.email,
      city: parsed.city,
    };
  }

  m = firstMatch(SUPPLIER_PROFILE, raw);
  if (m?.[1]) {
    return { kind: "view_profile", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  m = firstMatch(SUPPLIER_SEARCH_NAMED, raw);
  if (m?.[1]) {
    return { kind: "view_profile", supplierName: cleanSupplierName(m[1]), ...emptyExtras };
  }

  if (firstMatch(SUPPLIER_SEARCH_BARE, raw)) {
    return { kind: "view_list", supplierName: null, ...emptyExtras };
  }

  return null;
}

const MONTH_NAMES: { names: string[]; index: number }[] = [
  { names: ["january", "janvier"], index: 0 },
  { names: ["february", "février", "fevrier"], index: 1 },
  { names: ["march", "mars"], index: 2 },
  { names: ["april", "avril"], index: 3 },
  { names: ["may", "mai"], index: 4 },
  { names: ["june", "juin"], index: 5 },
  { names: ["july", "juillet"], index: 6 },
  { names: ["august", "août", "aout"], index: 7 },
  { names: ["september", "septembre"], index: 8 },
  { names: ["october", "octobre"], index: 9 },
  { names: ["november", "novembre"], index: 10 },
  { names: ["december", "décembre", "decembre"], index: 11 },
];

function monthRange(year: number, monthIndex0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, monthIndex0, 1));
  const to = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Resolves a raw period phrase ("June", "last month", "le mois dernier") into
// a concrete [from, to] date range (inclusive, YYYY-MM-DD). A bare month name
// with no year resolves to the most recent occurrence of that month (this
// year, or last year if that month hasn't happened yet). Unrecognized phrases
// return { from: null, to: null } — the caller falls back to "all time".
export function resolvePeriodToRange(
  periodText: string | null,
  reference: Date = new Date(),
): { from: string | null; to: string | null } {
  if (!periodText) return { from: null, to: null };
  const p = normalizeText(periodText);
  if (!p) return { from: null, to: null };

  if (/\b(last month|mois dernier)\b/.test(p)) {
    const ref = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
    return monthRange(ref.getUTCFullYear(), ref.getUTCMonth());
  }
  if (/\b(this month|ce mois)\b/.test(p)) {
    return monthRange(reference.getUTCFullYear(), reference.getUTCMonth());
  }

  const yearMatch = p.match(/\b(20\d{2})\b/);
  for (const entry of MONTH_NAMES) {
    if (entry.names.some((name) => p.includes(name))) {
      let year = yearMatch ? Number(yearMatch[1]) : reference.getUTCFullYear();
      if (!yearMatch && entry.index > reference.getUTCMonth()) year -= 1;
      return monthRange(year, entry.index);
    }
  }

  return { from: null, to: null };
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectIntent(text: string): CommandIntent {
  const lower = text.toLowerCase();
  const isCreateCustomer = CREATE_CUSTOMER_PATTERNS.some((p) => p.test(lower));
  if (isCreateCustomer) return "create_customer";

  // Supplier detection runs FIRST: every SUPPLIER_* pattern requires the
  // literal word "supplier"/"fournisseur", so it can never accidentally fire
  // on customer text. Several CUSTOMER_* patterns are intentionally looser
  // (e.g. matching a bare possessive "X's profile/ledger/statement" without
  // requiring the word "customer"/"client" — see the CUSTOMER_PROFILE et al.
  // comments), so checking customer first would let those loose patterns
  // swallow a supplier command like "Open supplier Adamou's profile" before
  // the supplier check ever runs. Checking the stricter supplier patterns
  // first eliminates that collision without having to tighten every loose
  // customer pattern.
  if (detectSupplierAction(text)) return "supplier_action";
  if (detectCustomerAction(text)) return "customer_action";

  const isReceipt = RECEIPT_PATTERNS.some((p) => p.test(lower));
  const isPayment = PAYMENT_PATTERNS.some((p) => p.test(lower));
  const isStockReceipt = STOCK_RECEIPT_PATTERNS.some((p) => p.test(lower));
  const hasQuantity = QUANTITY_PATTERN.test(text);
  const hasCurrency = CURRENCY_PATTERN.test(text);

  if (isStockReceipt && hasQuantity && !hasCurrency) {
    return "create_goods_receipt";
  }

  if (/\bpayment\b/i.test(text) && isReceipt && !isPayment) {
    return "create_receipt";
  }

  if (isReceipt && !isPayment) return "create_receipt";
  if (isPayment && !isReceipt) return "create_payment";
  if (isReceipt && isPayment) {
    if (/\b(from|de|client|say|se)\b/i.test(text)) return "create_receipt";
    if (/\b(to|à|fournisseur|supplier|for|pour|ko)\b/i.test(text)) return "create_payment";
  }

  if (extractAmount(text) && HINDI_FROM_SUFFIX.test(text) && !isPayment) {
    return "create_receipt";
  }

  return "unknown";
}

function extractQuantity(text: string): { quantity: string; unit: string } | null {
  const match = text.match(QUANTITY_PATTERN);
  if (!match?.[1] || !match[2]) return null;
  const quantity = match[1].replace(/[\s,.'']/g, "");
  if (!quantity || quantity === "0") return null;
  return { quantity, unit: match[2].toLowerCase() };
}

function extractItemDescription(text: string): string | null {
  const match = text.match(/\bof\s+(.+)$/i) ?? text.match(/\bde\s+(.+)$/i);
  if (!match?.[1]) return null;
  let desc = match[1]
    .replace(/\s+(?:from|de|du|de la|des|by|par)\s+.+$/i, "")
    .trim();
  desc = humanizeDescription(desc);
  return desc.length >= 2 ? desc : null;
}

function isQuantityNumber(text: string, numberStart: number): boolean {
  const tail = text.slice(numberStart, numberStart + 40);
  return QUANTITY_PATTERN.test(tail) && !MONEY_MODIFIER_PATTERN.test(tail);
}

function extractAmount(text: string): string | null {
  const normalized = text
    .replace(/\bxaf\b|\bfcfa\b|\bfrancs?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /(\d[\d\s,.'']*(?:\.\d+)?)\s*(?:million|millions|mio|m\b)/i,
    /(\d[\d\s,.'']*(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const matchIndex = match.index ?? 0;
    if (isQuantityNumber(normalized, matchIndex)) continue;
    let raw = match[1].replace(/[\s,.'']/g, "");
    const slice = normalized.slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 10);
    if (/million|millions|mio|\bm\b/i.test(slice)) {
      const base = Number.parseFloat(raw);
      if (!Number.isNaN(base)) {
        raw = String(Math.round(base * 1_000_000));
      }
    }
    if (raw && raw !== "0") return raw;
  }
  return null;
}

function cleanLabel(text: string): string {
  return text
    .replace(
      /\b(xaf|fcfa|francs?|million|millions|today|hier|yesterday|aujourd'hui|boss|aj|aaj|humko|hame|humein|humne|hai|hain|milli|mila|mili|payment|ko|ka|ki|ke)\b/gi,
      "",
    )
    .replace(/\b\d[\d\s,.'']*(?:\.\d+)?\s*(?:million|millions|mio|m)?\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

const SPLIT_WORDS = [
  "renault",
  "truck",
  "tire",
  "tyre",
  "pneu",
  "change",
  "fuel",
  "transport",
  "vehicle",
  "rent",
  "salary",
  "bank",
  "charge",
  "repair",
  "maintenance",
  "insurance",
  "office",
  "supplies",
];

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Fix voice/parse gluing like "renaulttrucktire" → "Renault Truck Tire". */
export function humanizeDescription(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/\s/.test(trimmed)) return titleCase(trimmed);

  let lower = trimmed.toLowerCase();
  for (const word of [...SPLIT_WORDS].sort((a, b) => b.length - a.length)) {
    lower = lower.replace(new RegExp(word, "g"), ` ${word} `);
  }
  return titleCase(lower.replace(/\s+/g, " ").trim() || trimmed);
}

function cleanDescription(text: string): string {
  const stripped = text
    .replace(/\b(xaf|fcfa|francs?|million|millions|today|hier|yesterday|aujourd'hui)\b/gi, "")
    .replace(/\b\d[\d\s,.'']*(?:\.\d+)?\s*(?:million|millions|mio|m)?\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
  return humanizeDescription(stripped);
}

function extractForReason(text: string): string | null {
  const match = text.match(FOR_REASON_PATTERN);
  if (!match?.[1]) return null;
  const cleaned = cleanDescription(match[1]);
  return cleaned.length >= 2 ? cleaned : null;
}

function extractPartyName(text: string, intent: CommandIntent): string | null {
  const hindiFrom = text.match(HINDI_FROM_SUFFIX);
  if (hindiFrom?.[1]) {
    const cleaned = cleanLabel(hindiFrom[1]);
    if (cleaned.length >= 2) return cleaned;
  }

  const pattern = intent === "create_payment" ? TO_PARTY_PATTERN : FROM_PATTERN;
  const match = text.match(pattern);
  if (match?.[1]) {
    const cleaned = cleanLabel(match[1]);
    if (cleaned.length >= 2) return cleaned;
  }

  if (intent === "create_receipt") {
    const fallback =
      text.match(/\bfrom\s+(.+)$/i) ??
      text.match(/\bde\s+(.+)$/i) ??
      text.match(HINDI_FROM_SUFFIX);
    if (fallback?.[1]) {
      const cleaned = cleanLabel(fallback[1]);
      if (cleaned.length >= 2) return cleaned;
    }
  }

  if (intent === "create_payment") {
    const fallback = text.match(/\bto\s+(.+)$/i) ?? text.match(/\bà\s+(.+)$/i);
    if (fallback?.[1]) {
      const cleaned = cleanLabel(fallback[1]);
      if (cleaned.length >= 2) return cleaned;
    }
  }

  return null;
}

function stripCustomerNameLead(text: string): string {
  return cleanLabel(text.replace(CUSTOMER_NAME_LEAD, "").replace(/[.,]\s*$/, ""));
}

// Trailing clauses beyond name/city (phone, WhatsApp, an internal note, a
// "then open profile" follow-up) confuse the name/city regexes below, which
// expect the sentence to end right after the optional city — so they're cut
// off here (searched for in the FULL raw text separately, see
// extractCreateCustomerPhone/Whatsapp/PostAction) before the name/city
// extraction ever runs. Includes the clause's leading pronoun + comma (e.g.
// ", his phone...") so the remaining core clause doesn't end with a dangling
// "his"/"son".
const TRAILING_CLAUSE_LEAD =
  /,?\s*(?:his|her|their|son|sa|ses|leur)?\s*\b(?:phone|t[ée]l[ée]phone|tel|whatsapp|note|then|puis|ensuite|and\s+then|et\s+ensuite)\b/i;

function stripTrailingClauses(raw: string): string {
  const m = raw.match(TRAILING_CLAUSE_LEAD);
  if (!m || m.index === undefined) return raw;
  return raw.slice(0, m.index).replace(/[,.\s]+$/, "").trim();
}

function extractCreateCustomerPhone(raw: string): string | null {
  const m = raw.match(
    /\b(?:phone|t[ée]l[ée]phone|tel)\b(?:\s+number|\s+num[ée]ro)?(?:\s+is|\s+est)?\s*:?\s*([+\d][\d\s-]{5,})/i,
  );
  const digits = m?.[1]?.replace(/[\s-]/g, "").trim();
  return digits && digits.length >= 6 ? digits : null;
}

function extractCreateCustomerWhatsapp(raw: string, phone: string | null): string | null {
  const m = raw.match(
    /\bwhatsapp\b(?:\s+number|\s+num[ée]ro)?(?:\s+is|\s+est)?\s*:?\s*(?:le\s+)?(same(?:\s+number)?|m[êe]me(?:\s+num[ée]ro)?|[+\d][\d\s-]{5,})/i,
  );
  if (!m?.[1]) return null;
  if (/^(?:same|m[êe]me)/i.test(m[1])) return phone;
  const digits = m[1].replace(/[\s-]/g, "").trim();
  return digits.length >= 6 ? digits : null;
}

// Only recognizes the literal "open profile" follow-up (EN/FR) — anything
// else mentioned after saving (e.g. "then invoice him") is intentionally
// left for the AI path via unsupported_requests; the rule-based fallback
// never guesses at unrecognized post-actions.
function extractCreateCustomerPostAction(raw: string): "open_profile" | null {
  return /\bopen\b[^.?!]*\bprofile\b/i.test(raw) ||
    /\bouvrir\b[^.?!]*\b(?:profil|fiche)\b/i.test(raw)
    ? "open_profile"
    : null;
}

function extractCreateCustomerDetails(text: string): { name: string | null; city: string | null } {
  const asRole = text.match(
    /\b(?:add|ajouter)\s+(.+?)\s+(?:as\s+(?:a\s+)?(?:customer|client)|comme\s+client)\b(?:\s+(?:in|à|a|en)\s+(.+?))?$/i,
  );
  if (asRole?.[1]) {
    const name = stripCustomerNameLead(asRole[1]);
    const city = asRole[2] ? cleanLabel(asRole[2]) : null;
    if (name.length >= 2) return { name, city: city && city.length >= 2 ? city : null };
  }

  const namedRole = text.match(
    /\b(?:client|customer|un\s+client)\s+(?:nommé|nomme|named|called|appelé|appele|appellé)\s+(.+?)(?:\s+(?:in|à|a|en)\s+(.+?))?$/i,
  );
  if (namedRole?.[1]) {
    const name = stripCustomerNameLead(namedRole[1]);
    const city = namedRole[2] ? cleanLabel(namedRole[2]) : null;
    if (name.length >= 2) return { name, city: city && city.length >= 2 ? city : null };
  }

  const prefixed = text.match(
    /\b(?:add|create|new|ajouter|créer|creer|nouveau)\s+(?:a\s+)?(?:customers?|clients?|un\s+client)\s+(.+?)(?:\s+(?:in|à|a|en)\s+(.+?))?$/i,
  );
  if (prefixed?.[1]) {
    const name = stripCustomerNameLead(prefixed[1]);
    const city = prefixed[2] ? cleanLabel(prefixed[2]) : null;
    if (name.length >= 2) return { name, city: city && city.length >= 2 ? city : null };
  }

  const bareClient = text.match(
    /\b(?:add|ajouter)\s+clients?\s+(.+?)(?:\s+(?:in|à|a|en)\s+(.+?))?$/i,
  );
  if (bareClient?.[1]) {
    const name = stripCustomerNameLead(bareClient[1]);
    const city = bareClient[2] ? cleanLabel(bareClient[2]) : null;
    if (name.length >= 2) return { name, city: city && city.length >= 2 ? city : null };
  }

  return { name: null, city: null };
}

function parseCommandTextFull(text: string): ParsedCommand {
  const raw = text.trim();
  const intent = detectIntent(raw);
  const quantityMatch = intent === "create_goods_receipt" ? extractQuantity(raw) : null;
  const amountText = intent === "create_goods_receipt" ? null : extractAmount(raw);

  let partyName: string | null = null;
  let city: string | null = null;
  let expenseDescription: string | null = null;
  let paymentCategory: PaymentCategory | null = null;
  let receiptCategory: ReceiptCategory | null = null;
  let itemDescription: string | null = null;
  let customerAction: ParsedCustomerAction | null = null;
  let supplierAction: ParsedSupplierAction | null = null;
  let phone: string | null = null;
  let whatsapp: string | null = null;
  let postAction: "open_profile" | null = null;

  if (intent === "create_goods_receipt") {
    itemDescription = extractItemDescription(raw);
    partyName = extractPartyName(raw, "create_receipt");
  } else if (intent === "create_customer") {
    const details = extractCreateCustomerDetails(stripTrailingClauses(raw));
    partyName = details.name;
    city = details.city;
    phone = extractCreateCustomerPhone(raw);
    whatsapp = extractCreateCustomerWhatsapp(raw, phone);
    postAction = extractCreateCustomerPostAction(raw);
  } else if (intent === "customer_action") {
    customerAction = detectCustomerAction(raw);
    partyName = customerAction?.customerName ?? null;
    city = customerAction?.city ?? null;
  } else if (intent === "supplier_action") {
    supplierAction = detectSupplierAction(raw);
    partyName = supplierAction?.supplierName ?? null;
    city = supplierAction?.city ?? null;
  } else if (intent === "create_payment") {
    partyName = extractPartyName(raw, intent);
    const forReason = extractForReason(raw);

    if (partyName) {
      paymentCategory = "supplier";
    } else if (forReason) {
      expenseDescription = forReason;
      paymentCategory = "expense";
    } else {
      paymentCategory = "expense";
    }
  } else if (intent === "create_receipt") {
    partyName = extractPartyName(raw, intent);
    const forReason = extractForReason(raw);

    if (partyName) {
      receiptCategory = "customer";
    } else if (forReason) {
      expenseDescription = forReason;
      receiptCategory = "sales";
    } else {
      receiptCategory = "customer";
    }
  }

  return {
    intent,
    amountText,
    quantityText: quantityMatch?.quantity ?? null,
    quantityUnit: quantityMatch?.unit ?? null,
    itemDescription,
    partyName,
    city,
    expenseDescription,
    paymentCategory,
    receiptCategory,
    customerAction,
    supplierAction,
    phone,
    whatsapp,
    postAction,
    raw,
  };
}

/** Full intent detection for Ask Bantoo (includes create_customer). */
export function parseBantooCommandText(text: string): ParsedCommand {
  return parseCommandTextFull(text);
}

/**
 * Legacy command bar parser; create_customer, customer_action, and
 * supplier_action are treated as unknown.
 */
export function parseCommandText(text: string): LegacyParsedCommand {
  const parsed = parseCommandTextFull(text);
  if (
    parsed.intent === "create_customer" ||
    parsed.intent === "customer_action" ||
    parsed.intent === "supplier_action"
  ) {
    return { ...parsed, intent: "unknown" };
  }
  return parsed as LegacyParsedCommand;
}
