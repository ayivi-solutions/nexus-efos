-- PDDS §59 Audit and Assurance Architecture — true database-level
-- immutability for the audit trail, not just "no route happens to expose
-- update/delete." Even a compromised service-role credential or a future
-- accidental route addition cannot modify or remove an audit record once
-- written — Postgres itself refuses the operation.
--
-- Run this once, directly against Supabase (SQL Editor, or via
-- `psql "$DIRECT_URL" -f this-file.sql`). It is NOT a Prisma migration —
-- Prisma has no way to express a trigger declaratively in schema.prisma,
-- so this lives as its own hand-run script, same as any other one-off DDL
-- that sits outside the ORM's model.

CREATE OR REPLACE FUNCTION nexus.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log records are immutable: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON nexus.audit_log;

CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON nexus.audit_log
FOR EACH ROW EXECUTE FUNCTION nexus.prevent_audit_log_modification();

-- Verify: this should now fail with the exception above.
-- UPDATE nexus.audit_log SET action = 'test' WHERE false;
