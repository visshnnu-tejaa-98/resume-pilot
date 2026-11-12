# Database schema (Drizzle)

**Milestone:** M1 / M2
**Status:** todo

## Scope

Implement the tables from prd.md §14.3 in `packages/database` using Drizzle ORM:

- All tables listed in the §14.3 table, with the key constraints specified (unique indexes, FKs, checks)
- UUID primary keys everywhere
- Migration tooling set up (`drizzle-kit`) and a seed script for local dev

## Done when

- `drizzle-kit generate` + `drizzle-kit migrate` produce a schema matching §14.3 against local RDS/Postgres
- `balance >= 0` check constraint on `credit_accounts` and unique `(source_type, source_id)` on `credit_ledger` are enforced at the DB level, not just app level
