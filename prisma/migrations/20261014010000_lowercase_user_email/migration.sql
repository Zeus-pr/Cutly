-- Signup and password sign-in store emails in lowercase. Skip a row when another
-- row already uses that lowercase address, so the unique index is not broken.
UPDATE "User" AS u
SET email = lower(btrim(u.email))
WHERE u.email IS NOT NULL
  AND u.email <> lower(btrim(u.email))
  AND NOT EXISTS (
    SELECT 1
    FROM "User" AS other
    WHERE other.id <> u.id
      AND lower(btrim(other.email)) = lower(btrim(u.email))
  );
