-- Row-Level Security hardening (DEFENCE IN DEPTH — not yet wired into the app).
--
-- Today tenant isolation is enforced at the application layer: every query is
-- scoped by the orgId taken from the verified session + membership. The policies
-- below add a second layer at the database itself.
--
-- To adopt them you must, on every request, run queries inside a transaction
-- that first sets the tenant GUC, e.g.:
--
--   await prisma.$transaction(async (tx) => {
--     await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${orgId}'`);
--     ... tenant queries via tx ...
--   });
--
-- Until that wiring is in place, DO NOT enable these policies or normal queries
-- will return zero rows.

ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships     ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_accounts ON accounts
  USING ("orgId" = current_setting('app.current_org_id', true));
CREATE POLICY org_isolation_parties ON parties
  USING ("orgId" = current_setting('app.current_org_id', true));
CREATE POLICY org_isolation_entries ON journal_entries
  USING ("orgId" = current_setting('app.current_org_id', true));
CREATE POLICY org_isolation_lines ON journal_lines
  USING ("orgId" = current_setting('app.current_org_id', true));
CREATE POLICY org_isolation_memberships ON memberships
  USING ("orgId" = current_setting('app.current_org_id', true));
