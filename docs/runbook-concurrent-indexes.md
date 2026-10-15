# Runbook: failed CREATE INDEX CONCURRENTLY migrations

Migrations 20261015000100..000500 each build one index with `CREATE INDEX CONCURRENTLY`.
If one fails (lock timeout, deadlock, unique violation, cancelled deploy), Postgres leaves an
**INVALID** index behind and Prisma marks the migration as failed.

1. Find invalid indexes:
   ```sql
   SELECT c.relname AS index, t.relname AS table
   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
   WHERE NOT i.indisvalid;
   ```
2. Drop each one (not inside a transaction): `DROP INDEX CONCURRENTLY IF EXISTS "<index>";`
3. Mark the failed migration rolled back: `npx prisma migrate resolve --rolled-back <migration_name>`
4. Re-run: `npx prisma migrate deploy`, then repeat step 1 and confirm it returns no rows.

Never use `prisma db push` to "fix" this.
