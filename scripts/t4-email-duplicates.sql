-- T4 (#9) read-only pre-check for the lowercase email migration. SELECT only; prints ids and counts, never addresses.
-- Run: PGOPTIONS="-c default_transaction_read_only=on" psql "$DATABASE_URL" -X -A -f scripts/t4-email-duplicates.sql
SELECT 'User' AS tbl,
       count(*) FILTER (WHERE email IS NOT NULL AND email <> lower(btrim(email))) AS mixed_case_rows,
       (SELECT count(*) FROM (SELECT 1 FROM "User" WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1) g) AS duplicate_groups
FROM "User"
UNION ALL
SELECT 'Partner',
       count(*) FILTER (WHERE email IS NOT NULL AND email <> lower(btrim(email))),
       (SELECT count(*) FROM (SELECT 1 FROM "Partner" WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1) g)
FROM "Partner";

SELECT 'User' AS tbl, string_agg(id, ',' ORDER BY id) AS duplicate_ids
FROM "User" WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1
UNION ALL
SELECT 'Partner', string_agg(id, ',' ORDER BY id)
FROM "Partner" WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1;

-- Runbook (DBA #58 item 7): if 20261015125929_t4_email_lowercase_check aborts on duplicates,
-- nothing was changed. Fix the listed rows, then mark the failed migration rolled back and re-run:
--   npx prisma migrate resolve --rolled-back 20261015125929_t4_email_lowercase_check
--   npx prisma migrate deploy
