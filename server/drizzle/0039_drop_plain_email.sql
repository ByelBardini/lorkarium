-- The clear e-mail only goes when every account already has its cipher: the key lives in the env,
-- so SQL cannot seal it here. The whole migrate runs in one transaction and rolls back with this.
DO $$
DECLARE
  unsealed integer;
BEGIN
  SELECT count(*) INTO unsealed FROM users WHERE email_cipher IS NULL OR email_index IS NULL;
  IF unsealed > 0 THEN
    RAISE EXCEPTION '% account(s) still keep the e-mail in clear; expected 0. Run pnpm db:encrypt-emails, then migrate again', unsealed;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_cipher" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_index" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";
