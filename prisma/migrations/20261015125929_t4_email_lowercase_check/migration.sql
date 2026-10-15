-- T4 (#9), DBA item 3: emails are stored as lower(btrim(email)) on User and Partner.
-- (a) Pre-check: if two rows would share an address once lowercased, STOP. Nothing is
--     merged automatically; ops merges them by hand (report the ids to Team Lead) and
--     re-runs the migration. Only row ids are printed, never the addresses.
--     The same check, read-only, lives in scripts/t4-email-duplicates.sql.
DO $$
DECLARE
  user_dups text;
  partner_dups text;
BEGIN
  SELECT string_agg(ids, '; ') INTO user_dups FROM (
    SELECT string_agg(id, ',' ORDER BY id) AS ids
    FROM "User" WHERE email IS NOT NULL
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) d;
  SELECT string_agg(ids, '; ') INTO partner_dups FROM (
    SELECT string_agg(id, ',' ORDER BY id) AS ids
    FROM "Partner" WHERE email IS NOT NULL
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) d;
  IF user_dups IS NOT NULL OR partner_dups IS NOT NULL THEN
    RAISE EXCEPTION 'T4 email backfill stopped: case-insensitive duplicate emails. User ids: [%] Partner ids: [%]. Merge them by hand, then re-run.',
      coalesce(user_dups, 'none'), coalesce(partner_dups, 'none');
  END IF;
END $$;

-- (c) Backfill to lowercase (safe: no twins after the check above).
UPDATE "User" SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));
UPDATE "Partner" SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));

-- (d) CHECK as NOT VALID here; VALIDATE runs in the next migration (no long lock here).
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_chk" CHECK (email = lower(btrim(email))) NOT VALID;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_email_lowercase_chk" CHECK (email = lower(btrim(email))) NOT VALID;
