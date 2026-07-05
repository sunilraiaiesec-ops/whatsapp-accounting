// A tiny, purpose-built in-memory stand-in for the slice of Prisma's query
// API that lib/party-insights.ts (and friends) use: findMany/findFirst with
// nested relation `where`, aggregate (_count/_sum/_min/_max) and groupBy.
// Not a general Prisma mock — just enough shape-matching to let
// party-insights/parties tests exercise real aggregation logic against
// realistic fixtures without a database.

type Row = Record<string, unknown>;

function matchesCondition(value: unknown, cond: unknown): boolean {
  if (cond === null) return value == null;
  if (typeof cond === "object" && cond !== null && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ("not" in c) {
      if (c.not === null) return value != null;
      return value !== c.not;
    }
    if ("in" in c) return Array.isArray(c.in) && c.in.includes(value);
    if ("gte" in c || "lte" in c) {
      const v = value instanceof Date ? value.getTime() : value;
      if ("gte" in c) {
        const g = c.gte instanceof Date ? c.gte.getTime() : c.gte;
        if (!(typeof v === "number" && typeof g === "number" && v >= g)) return false;
      }
      if ("lte" in c) {
        const l = c.lte instanceof Date ? c.lte.getTime() : c.lte;
        if (!(typeof v === "number" && typeof l === "number" && v <= l)) return false;
      }
      return true;
    }
    // Nested relation where clause (e.g. `receipt: { orgId, partyId }`).
    return matchesWhere(value as Row, c);
  }
  return value === cond;
}

function matchesWhere(row: Row | undefined, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (!matchesCondition(row[key], cond)) return false;
  }
  return true;
}

function getPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row);
}

let idCounter = 0;

export function makeFakeModel(rows: Row[]) {
  return {
    create: async ({ data }: { data: Row }) => {
      const row: Row = { id: data.id ?? `fake_${(idCounter += 1)}`, ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error("Row not found");
      // Mirror real Prisma semantics: an `undefined` value in `data` means
      // "leave this field alone", not "set it to undefined".
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) row[key] = value;
      }
      return row;
    },
    findMany: async ({ where, orderBy, take }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number } = {}) => {
      let result = rows.filter((r) => matchesWhere(r, where));
      if (orderBy) {
        const [[key, dir]] = Object.entries(orderBy) as [string, "asc" | "desc" | Record<string, unknown>][];
        result = [...result].sort((a, b) => {
          const sortKey = typeof dir === "object" ? Object.keys(dir)[0] : key;
          const sortDir = typeof dir === "object" ? Object.values(dir)[0] : dir;
          const av = getPath(a, typeof dir === "object" ? `${key}.${sortKey}` : key);
          const bv = getPath(b, typeof dir === "object" ? `${key}.${sortKey}` : key);
          const an = av instanceof Date ? av.getTime() : (av as number);
          const bn = bv instanceof Date ? bv.getTime() : (bv as number);
          return sortDir === "desc" ? bn - an : an - bn;
        });
      }
      return take ? result.slice(0, take) : result;
    },
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.find((r) => matchesWhere(r, where)) ?? null,
    aggregate: async ({
      where,
      _count,
      _sum,
      _min,
      _max,
    }: {
      where?: Record<string, unknown>;
      _count?: unknown;
      _sum?: Record<string, boolean>;
      _min?: Record<string, boolean>;
      _max?: Record<string, boolean>;
    }) => {
      const matched = rows.filter((r) => matchesWhere(r, where));
      const out: Record<string, unknown> = {};
      if (_count) out._count = { _all: matched.length };
      if (_sum) {
        out._sum = {};
        for (const field of Object.keys(_sum)) {
          (out._sum as Row)[field] = matched.reduce(
            (s: bigint, r) => s + ((r[field] as bigint) ?? 0n),
            0n,
          );
        }
      }
      if (_min) {
        out._min = {};
        for (const field of Object.keys(_min)) {
          const vals = matched.map((r) => r[field] as Date).filter(Boolean);
          (out._min as Row)[field] = vals.length ? vals.reduce((a, b) => (a < b ? a : b)) : null;
        }
      }
      if (_max) {
        out._max = {};
        for (const field of Object.keys(_max)) {
          const vals = matched.map((r) => r[field] as Date).filter(Boolean);
          (out._max as Row)[field] = vals.length ? vals.reduce((a, b) => (a > b ? a : b)) : null;
        }
      }
      return out;
    },
    groupBy: async ({
      by,
      where,
      _count,
    }: {
      by: string[];
      where?: Record<string, unknown>;
      _count?: Record<string, boolean>;
    }) => {
      const matched = rows.filter((r) => matchesWhere(r, where));
      const groups = new Map<string, { key: Row; rows: Row[] }>();
      for (const row of matched) {
        const key: Row = {};
        for (const field of by) key[field] = row[field];
        const keyStr = JSON.stringify(key);
        const g = groups.get(keyStr) ?? { key, rows: [] };
        g.rows.push(row);
        groups.set(keyStr, g);
      }
      return [...groups.values()].map((g) => {
        const out: Row = { ...g.key };
        if (_count) {
          out._count = {} as Row;
          for (const field of Object.keys(_count)) {
            (out._count as Row)[field] = g.rows.filter((r) => r[field] != null).length;
          }
        }
        return out;
      });
    },
  };
}
