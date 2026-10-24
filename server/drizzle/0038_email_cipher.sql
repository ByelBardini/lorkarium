ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_cipher" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_index" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_index_unique" UNIQUE("email_index");