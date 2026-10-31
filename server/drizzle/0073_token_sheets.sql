CREATE TYPE "public"."sheet_visibility" AS ENUM('controllers', 'table');--> statement-breakpoint
CREATE TABLE "sheet_actions" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "sheet_actions_campaign_id_user_id_action_id_pk" PRIMARY KEY("campaign_id","user_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "token_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"visibility" "sheet_visibility" DEFAULT 'controllers' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_sheets_token_id_unique" UNIQUE("token_id"),
	CONSTRAINT "token_sheets_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "token_sheets_version_nonnegative" CHECK ("token_sheets"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sheet_actions" ADD CONSTRAINT "sheet_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_template_fk" FOREIGN KEY ("campaign_id","template_id") REFERENCES "public"."sheet_templates"("campaign_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_sheets_template_idx" ON "token_sheets" USING btree ("campaign_id","template_id");