-- credit_ledger is append-only (prd.md §3.5): every credit movement is a
-- new row, nothing is ever edited or removed. Enforced in the database
-- so no code path (or manual query) can rewrite history.
--
-- The one exception is the ON DELETE CASCADE from users: deleting an
-- account on request (DPDP, prd.md §15) must remove its ledger. During
-- the cascade the parent users row is already gone, which is how the
-- trigger tells it apart from a direct DELETE.
CREATE FUNCTION credit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'credit_ledger is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION credit_ledger_append_only();
--> statement-breakpoint
CREATE TRIGGER credit_ledger_no_truncate
  BEFORE TRUNCATE ON credit_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION credit_ledger_append_only();
