CREATE TYPE "public"."account_recovery_kind" AS ENUM('cancel-email-change', 'revert-email-change', 'revert-password-change');--> statement-breakpoint
CREATE TABLE "account_recovery_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "account_recovery_kind" NOT NULL,
	"email_cipher" text,
	"email_index" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_recovery_tokens_email_only_on_revert" CHECK (("account_recovery_tokens"."kind" = 'revert-email-change') = ("account_recovery_tokens"."email_cipher" IS NOT NULL AND "account_recovery_tokens"."email_index" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_recovery_tokens" ADD CONSTRAINT "account_recovery_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_recovery_tokens_user_id_idx" ON "account_recovery_tokens" USING btree ("user_id");