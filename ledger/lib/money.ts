// Money is stored as BigInt minor units. The number of minor units per major
// unit depends on the currency (XAF/JPY have 0 decimals, USD/EUR have 2).

const ZERO_DECIMAL = new Set(["XAF", "XOF", "JPY", "KRW", "VND", "CLP"]);

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

// Parse a human-typed amount ("5,800,000" or "12.50") into minor units.
export function parseAmount(input: string | number, currency: string): bigint {
  const decimals = currencyDecimals(currency);
  const raw = String(input).trim().replace(/[\s,]/g, "");
  if (raw === "" || raw === "-") return 0n;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, frac = ""] = unsigned.split(".");

  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole || "0"}${fracPadded}`.replace(/^0+(?=\d)/, "");
  const value = BigInt(combined || "0");
  return negative ? -value : value;
}

// Format minor units back to a major-unit string ("5800000" -> "5,800,000.00").
export function formatAmount(minor: bigint, currency: string): string {
  const decimals = currencyDecimals(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const s = abs.toString().padStart(decimals + 1, "0");

  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = decimals > 0 ? s.slice(s.length - decimals) : "";

  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = decimals > 0 ? `${wholeGrouped}.${frac}` : wholeGrouped;
  return negative ? `-${body}` : body;
}

// Convenience for display with a currency code suffix.
export function formatMoney(minor: bigint, currency: string): string {
  return `${formatAmount(minor, currency)} ${currency.toUpperCase()}`;
}
