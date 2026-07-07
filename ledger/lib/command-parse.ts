export type CommandIntent =
  | "create_receipt"
  | "create_payment"
  | "create_goods_receipt"
  | "create_customer"
  | "unknown";

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
  raw: string;
};

export type LegacyCommandIntent = Exclude<CommandIntent, "create_customer">;

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
  /\b(?:add|create|new)\s+(?:a\s+)?customer\b/i,
  /\b(?:ajouter|créer|creer|nouveau)\s+(?:un\s+)?client\b/i,
  /\b(?:add|ajouter)\s+.+\s+(?:as\s+(?:a\s+)?customer|comme\s+client)\b/i,
];

function detectIntent(text: string): CommandIntent {
  const lower = text.toLowerCase();
  const isCreateCustomer = CREATE_CUSTOMER_PATTERNS.some((p) => p.test(lower));
  if (isCreateCustomer) return "create_customer";

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

function extractCreateCustomerDetails(text: string): { name: string | null; city: string | null } {
  const asCustomer = text.match(
    /\b(?:add|ajouter)\s+(.+?)\s+(?:as\s+(?:a\s+)?customer|comme\s+client)\b(?:\s+(?:in|à|a)\s+(.+?))?$/i,
  );
  if (asCustomer?.[1]) {
    const name = cleanLabel(asCustomer[1]);
    const city = asCustomer[2] ? cleanLabel(asCustomer[2]) : null;
    if (name.length >= 2) return { name, city: city && city.length >= 2 ? city : null };
  }

  const prefixed = text.match(
    /\b(?:add|create|new|ajouter|créer|creer|nouveau)\s+(?:a\s+)?(?:customer|client|un\s+client)\s+(.+?)(?:\s+(?:in|à|a)\s+(.+?))?$/i,
  );
  if (prefixed?.[1]) {
    const name = cleanLabel(prefixed[1]);
    const city = prefixed[2] ? cleanLabel(prefixed[2]) : null;
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

  if (intent === "create_goods_receipt") {
    itemDescription = extractItemDescription(raw);
    partyName = extractPartyName(raw, "create_receipt");
  } else if (intent === "create_customer") {
    const details = extractCreateCustomerDetails(raw);
    partyName = details.name;
    city = details.city;
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
    raw,
  };
}

/** Full intent detection for Ask Bantoo (includes create_customer). */
export function parseBantooCommandText(text: string): ParsedCommand {
  return parseCommandTextFull(text);
}

/** Legacy command bar parser; create_customer is treated as unknown. */
export function parseCommandText(text: string): LegacyParsedCommand {
  const parsed = parseCommandTextFull(text);
  if (parsed.intent === "create_customer") {
    return { ...parsed, intent: "unknown" };
  }
  return parsed as LegacyParsedCommand;
}
