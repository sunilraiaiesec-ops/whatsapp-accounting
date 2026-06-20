export type CommandIntent = "create_receipt" | "create_payment" | "unknown";

export type ParsedCommand = {
  intent: CommandIntent;
  amountText: string | null;
  partyName: string | null;
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

const TO_PATTERN =
  /\b(?:to|à|a|au|pour|supplier|fournisseur|vendor)\s+(.+?)(?:\s+(?:for|pour|on|le|today|hier|yesterday)|$)/i;

function detectIntent(text: string): CommandIntent {
  const lower = text.toLowerCase();
  const isReceipt = RECEIPT_PATTERNS.some((p) => p.test(lower));
  const isPayment = PAYMENT_PATTERNS.some((p) => p.test(lower));

  if (isReceipt && !isPayment) return "create_receipt";
  if (isPayment && !isReceipt) return "create_payment";
  if (isReceipt && isPayment) {
    if (/\b(from|de|client)\b/i.test(text)) return "create_receipt";
    if (/\b(to|à|fournisseur|supplier)\b/i.test(text)) return "create_payment";
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
    if (/million|millions|mio|\bm\b/i.test(normalized.slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 10))) {
      const base = Number.parseFloat(raw);
      if (!Number.isNaN(base)) {
        raw = String(Math.round(base * 1_000_000));
      }
    }
    if (raw && raw !== "0") return raw;
  }
  return null;
}

function cleanPartyName(name: string): string {
  return name
    .replace(/\b(xaf|fcfa|francs?|million|millions|today|hier|yesterday|aujourd'hui)\b/gi, "")
    .replace(/[\d,.'\s]+(?:million|millions|m)?/gi, "")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

function extractPartyName(text: string, intent: CommandIntent): string | null {
  const pattern = intent === "create_payment" ? TO_PATTERN : FROM_PATTERN;
  const match = text.match(pattern);
  if (match?.[1]) {
    const cleaned = cleanPartyName(match[1]);
    if (cleaned.length >= 2) return cleaned;
  }

  if (intent === "create_receipt") {
    const fallback = text.match(/\bfrom\s+(.+)$/i) ?? text.match(/\bde\s+(.+)$/i);
    if (fallback?.[1]) {
      const cleaned = cleanPartyName(fallback[1]);
      if (cleaned.length >= 2) return cleaned;
    }
  }

  if (intent === "create_payment") {
    const fallback = text.match(/\bto\s+(.+)$/i) ?? text.match(/\bà\s+(.+)$/i);
    if (fallback?.[1]) {
      const cleaned = cleanPartyName(fallback[1]);
      if (cleaned.length >= 2) return cleaned;
    }
  }

  return null;
}

export function parseCommandText(text: string): ParsedCommand {
  const raw = text.trim();
  const intent = detectIntent(raw);
  const amountText = extractAmount(raw);
  const partyName = intent === "unknown" ? null : extractPartyName(raw, intent);

  return { intent, amountText, partyName, raw };
}
