// A purpose-built in-memory Prisma stand-in for the Migration Wizard test
// suite. Unlike lib/test-utils/fakePrisma.ts (read-mostly aggregation
// helper), this one supports create/update/upsert/deleteMany AND a
// `$transaction(async (tx) => ...)` with REAL rollback semantics — the
// callback runs against a deep clone of every table, and the clone is only
// copied back onto the real tables if the callback resolves. If it throws,
// the real tables are left completely untouched. This is what lets the
// "transactional rollback" test assert nothing was partially committed.

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const TABLE_NAMES = [
  "account",
  "party",
  "inventoryItem",
  "migrationWizard",
  "migrationOpeningBalance",
  "migrationBankBalance",
  "migrationCustomerBalance",
  "migrationSupplierBalance",
  "migrationInventoryBalance",
  "migrationAcknowledgedWarning",
  "migrationImportRun",
  "journalEntry",
  "journalLine",
] as const;

type TableName = (typeof TABLE_NAMES)[number];

function cloneTables(tables: Tables): Tables {
  const out: Tables = {};
  for (const name of TABLE_NAMES) out[name] = tables[name].map((r) => ({ ...r }));
  return out;
}

function commitInto(target: Tables, source: Tables): void {
  for (const name of TABLE_NAMES) {
    target[name].splice(0, target[name].length, ...source[name]);
  }
}

function matchesCondition(value: unknown, cond: unknown): boolean {
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ("in" in c) return Array.isArray(c.in) && c.in.includes(value);
    if ("not" in c) return value !== c.not;
  }
  return value === cond;
}

function matchesWhere(row: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    // A compound-unique field (e.g. `wizardId_accountId: { wizardId, accountId }`)
    // used inside a plain `where` (not `findUnique`) — flatten and re-check.
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !("in" in (cond as object)) && !("not" in (cond as object))) {
      if (!matchesWhere(row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchesCondition(row[key], cond)) return false;
  }
  return true;
}

// `findUnique`'s `where` is either `{ id }` or a single compound-unique key
// like `{ orgId_code: { orgId, code } }` / `{ wizardId_accountId: {...} }`.
function findUniqueRow(table: Row[], where: Record<string, unknown>): Row | undefined {
  const entries = Object.entries(where);
  if (entries.length !== 1) return table.find((r) => matchesWhere(r, where));
  const [key, val] = entries[0];
  if (val && typeof val === "object" && !(val instanceof Date)) {
    const sub = val as Record<string, unknown>;
    return table.find((r) => Object.entries(sub).every(([k, v]) => r[k] === v));
  }
  return table.find((r) => r[key] === val);
}

function project<T extends Row>(row: T, select?: Record<string, boolean>): T {
  if (!select) return row;
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out as T;
}

function sortBy(rows: Row[], orderBy: Record<string, "asc" | "desc">): Row[] {
  const [[key, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = av === bv ? 0 : av! > bv! ? 1 : -1;
    return dir === "desc" ? -cmp : cmp;
  });
}

function applyFieldUpdate(row: Row, key: string, value: unknown): void {
  if (value && typeof value === "object" && !(value instanceof Date) && "increment" in (value as object)) {
    const inc = (value as { increment: unknown }).increment;
    const current = row[key];
    if (typeof current === "bigint" || typeof inc === "bigint") {
      row[key] = (BigInt((current as bigint | number | string) ?? 0) + BigInt(inc as bigint | number | string));
    } else if (typeof current === "object" && current !== null && "plus" in (current as { plus?: unknown })) {
      // Prisma.Decimal-like value.
      row[key] = (current as { plus: (v: unknown) => unknown }).plus(inc);
    } else {
      row[key] = (Number(current ?? 0) + Number(inc)) as unknown;
    }
    return;
  }
  if (value !== undefined) row[key] = value;
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `fake_${prefix}_${idSeq}`;
}

type FakeModel = {
  findUnique: (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<Row | null>;
  findFirst: (args?: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<Row | null>;
  findMany: (args?: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    select?: Record<string, boolean>;
  }) => Promise<Row[]>;
  create: (args: { data: Row; include?: { lines?: boolean } }) => Promise<Row>;
  update: (args: { where: Record<string, unknown>; data: Row }) => Promise<Row>;
  upsert: (args: { where: Record<string, unknown>; create: Row; update: Row }) => Promise<Row>;
  deleteMany: (args?: { where?: Record<string, unknown> }) => Promise<{ count: number }>;
};

function buildClient(tables: Tables): Record<TableName, FakeModel> {
  function model(name: TableName): FakeModel {
    const table = tables[name];
    return {
      findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const row = findUniqueRow(table, where);
        return row ? project(row, select) : null;
      },
      findFirst: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> } = {}) => {
        const row = table.find((r) => matchesWhere(r, where));
        return row ? project(row, select) : null;
      },
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        select?: Record<string, boolean>;
      } = {}) => {
        let result = table.filter((r) => matchesWhere(r, where));
        if (orderBy) result = sortBy(result, orderBy);
        return result.map((r) => project(r, select));
      },
      create: async ({ data, include }: { data: Row; include?: { lines?: boolean } }) => {
        const nested = data.lines as { create?: Row[] } | undefined;
        const row: Row = { id: (data.id as string) ?? nextId(name), createdAt: new Date(), updatedAt: new Date(), ...data };
        delete row.lines;
        table.push(row);
        if (name === "journalEntry" && nested?.create) {
          const lines = nested.create.map((l) => ({ id: nextId("line"), journalEntryId: row.id, orgId: row.orgId, ...l }));
          tables.journalLine.push(...lines);
          if (include?.lines) return { ...row, lines };
        }
        return row;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const row = findUniqueRow(table, where);
        if (!row) throw new Error(`${name} row not found for update`);
        for (const [key, value] of Object.entries(data)) applyFieldUpdate(row, key, value);
        row.updatedAt = new Date();
        return row;
      },
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Row; update: Row }) => {
        const row = findUniqueRow(table, where);
        if (row) {
          for (const [key, value] of Object.entries(update)) applyFieldUpdate(row, key, value);
          row.updatedAt = new Date();
          return row;
        }
        const newRow: Row = { id: nextId(name), updatedAt: new Date(), createdAt: new Date(), ...create };
        table.push(newRow);
        return newRow;
      },
      deleteMany: async ({ where }: { where?: Record<string, unknown> } = {}) => {
        const keep = table.filter((r) => !matchesWhere(r, where));
        const removed = table.length - keep.length;
        table.splice(0, table.length, ...keep);
        return { count: removed };
      },
    };
  }

  const client = {} as Record<TableName, FakeModel>;
  for (const name of TABLE_NAMES) client[name] = model(name);
  return client;
}

export type FakeMigrationPrisma = Record<TableName, FakeModel> & {
  $transaction: (arg: unknown[] | ((tx: Record<TableName, FakeModel>) => Promise<unknown>)) => Promise<unknown>;
  __tables: Tables;
};

// Creates a fresh fake Prisma client with empty tables. Seed rows directly
// via `client.__tables.account.push(...)` etc, or use the small seed
// helpers in this file.
export function createFakeMigrationPrisma(): FakeMigrationPrisma {
  const tables: Tables = {} as Tables;
  for (const name of TABLE_NAMES) tables[name] = [];

  const base = buildClient(tables);

  const client = {
    ...base,
    __tables: tables,
    $transaction: async (arg: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
      if (Array.isArray(arg)) {
        // Fake model calls execute eagerly (they're plain async functions,
        // not deferred query builders), so by construction time the array's
        // operations have already run against the live tables. Just await
        // them — sufficient for the non-callback call sites in this app
        // (e.g. rerunMigrationWizardAction), which aren't under test for
        // rollback semantics here.
        return Promise.all(arg);
      }
      const clone = cloneTables(tables);
      const txClient = buildClient(clone);
      const result = await arg(txClient); // let it throw — tables untouched on failure
      commitInto(tables, clone);
      return result;
    },
  } as FakeMigrationPrisma;

  return client;
}

export function makeAccount(overrides: Partial<Row> & { orgId: string; code: string; name: string; type: string }): Row {
  return {
    id: nextId("account"),
    subtype: null,
    isControl: false,
    currency: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeParty(overrides: Partial<Row> & { orgId: string; name: string; type: string }): Row {
  return { id: nextId("party"), phone: null, whatsapp: null, country: null, city: null, ...overrides };
}

export function makeInventoryItem(overrides: Partial<Row> & { orgId: string; code: string; name: string }): Row {
  return {
    id: nextId("item"),
    unit: null,
    salePrice: 0n,
    qtyOnHand: 0,
    valueOnHand: 0n,
    ...overrides,
  };
}

export function makeWizard(overrides: Partial<Row> & { orgId: string }): Row {
  return {
    id: nextId("wizard"),
    status: "NOT_STARTED",
    currentStep: 1,
    openingDate: null,
    completedAt: null,
    completedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
