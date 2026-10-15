-- DBA #58 item 5: an EmailCode belongs to exactly one subject (a user or a pending signup).
-- Rows breaking this can't exist from the app; clear any strays first (codes are short-lived).
DELETE FROM "EmailCode" WHERE ("userId" IS NULL) = ("pendingSignupId" IS NULL);
ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_one_subject_chk"
  CHECK (("userId" IS NULL) <> ("pendingSignupId" IS NULL));
