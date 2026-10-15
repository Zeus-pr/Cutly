-- T4 (#9), DBA item 3(d): validate the lowercase CHECKs added NOT VALID in the previous migration.
-- VALIDATE takes SHARE UPDATE EXCLUSIVE only, so reads and writes continue.
ALTER TABLE "User" VALIDATE CONSTRAINT "User_email_lowercase_chk";
ALTER TABLE "Partner" VALIDATE CONSTRAINT "Partner_email_lowercase_chk";
