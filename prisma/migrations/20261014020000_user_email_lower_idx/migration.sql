-- Password and Google sign-in fall back to lower(btrim(email)) when the
-- stored address is not already lowercase. This keeps that lookup off a full scan.
CREATE INDEX IF NOT EXISTS "User_email_lower_idx" ON "User" (lower(btrim(email)));
