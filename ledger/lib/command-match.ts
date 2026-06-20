export type PartyCandidate = {
  id: string;
  name: string;
  score: number;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) shared += 1;
  }
  return shared / Math.max(ta.size, tb.size);
}

export function rankInventoryItems(
  query: string,
  items: { id: string; name: string; code: string }[],
): PartyCandidate[] {
  const nq = normalize(query);
  if (!nq) return [];

  return items
    .map((item) => {
      const label = `${item.code} ${item.name}`;
      const nl = normalize(label);
      let score = 0;
      if (nl === nq || normalize(item.name) === nq) score = 1;
      else if (nl.includes(nq) || nq.includes(normalize(item.name))) score = 0.85;
      else score = tokenOverlap(query, label);
      return { id: item.id, name: item.name, score };
    })
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function rankParties(
  query: string,
  parties: { id: string; name: string }[],
): PartyCandidate[] {
  const nq = normalize(query);
  if (!nq) return [];

  return parties
    .map((p) => {
      const np = normalize(p.name);
      let score = 0;
      if (np === nq) score = 1;
      else if (np.includes(nq) || nq.includes(np)) score = 0.85;
      else score = tokenOverlap(query, p.name);
      return { id: p.id, name: p.name, score };
    })
    .filter((p) => p.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
