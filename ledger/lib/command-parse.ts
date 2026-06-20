export type CommandIntent = "create_receipt" | "create_payment" | "unknown";

export type PaymentCategory = "supplier" | "expense";
export type ReceiptCategory = "customer" | "sales";

export type ParsedCommand = {
  intent: CommandIntent;
  amountText: string | null;
  partyName: string | null;
  expenseDescription: string | null;
  paymentCategory: PaymentCategory | null;
  receiptCategory: ReceiptCategory | null;
  raw: string;
};

const RECEIPT_PATTERNS = [
  /\b(received?|receive|reçu|recu|encaiss(?:é|e|ement)?|got)\b/i,
];

const PAYMENT_PATTERNS = [
  /\b(paid?|pay|payé|paye|décaiss(?:é|e|ement)?|decaiss(?:é|e|ement)?|sent)\b/i,
];

const FROM_PATTERN =
  /\b(?:from|de|du|de la|des|customer|client|by)\s+(.+?)(?:\s+(?:for|pour|on|le|today|hier|yesterday)|$)/i;

const TO_PARTY_PATTERN =
  /\b(?:to|à|au|a|supplier|fournisseur|vendor)\s+(.+?)(?:\s+(?:for|pour|on|le|today|hier|yesterday)|$)/i;

const FOR_REASON_PATTERN = /\b(?:for|pour)\s+(.+)$/i;

function detectIntent(text: string): CommandIntent {
  const lower = text.toLowerCase();
  const isReceipt = RECEIPT_PATTERNS.some((p) => p.test(lower));
  const isPayment = PAYMENT_PATTERNS.some((p) => p.test(lower));

  if (isReceipt && !isPayment) return "create_receipt";
  if (isPayment && !isReceipt) return "create_payment";
  if (isReceipt && isPayment) {
    if (/\b(from|de|client)\b/i.test(text)) return "create_receipt";
    if (/\b(to|à|fournisseur|supplier|for|pour)\b/i.test(text)) return "create_payment";
  }
  return "unknown";
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
    .replace(/\b(xaf|fcfa|francs?|million|millions|today|hier|yesterday|aujourd'hui)\b/gi, "")
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
  const pattern = intent === "create_payment" ? TO_PARTY_PATTERN : FROM_PATTERN;
  const match = text.match(pattern);
  if (match?.[1]) {
    const cleaned = cleanLabel(match[1]);
    if (cleaned.length >= 2) return cleaned;
  }

  if (intent === "create_receipt") {
    const fallback = text.match(/\bfrom\s+(.+)$/i) ?? text.match(/\bde\s+(.+)$/i);
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

export function parseCommandText(text: string): ParsedCommand {
  const raw = text.trim();
  const intent = detectIntent(raw);
  const amountText = extractAmount(raw);

  let partyName: string | null = null;
  let expenseDescription: string | null = null;
  let paymentCategory: PaymentCategory | null = null;
  let receiptCategory: ReceiptCategory | null = null;

  if (intent === "create_payment") {
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
    partyName,
    expenseDescription,
    paymentCategory,
    receiptCategory,
    raw,
  };
}
