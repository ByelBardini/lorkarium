CREATE TYPE "public"."condition_tone" AS ENUM('benefit', 'harm');--> statement-breakpoint
CREATE TABLE "active_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"remaining_rounds" integer,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "active_conditions_token_condition_unique" UNIQUE("token_id","condition_id")
);
--> statement-breakpoint
CREATE TABLE "condition_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tone" "condition_tone" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_conditions" ADD CONSTRAINT "active_conditions_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_conditions" ADD CONSTRAINT "active_conditions_condition_id_condition_definitions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."condition_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_definitions" ADD CONSTRAINT "condition_definitions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "condition_definitions_campaign_name_unique" ON "condition_definitions" USING btree ("campaign_id",lower("name"));--> statement-breakpoint
-- Every campaign that already exists gets the initial list (the same as condition-rules.bo.ts).
INSERT INTO "condition_definitions" ("campaign_id", "name", "tone")
SELECT "campaigns"."id", "initial"."name", "initial"."tone"::"condition_tone"
FROM "campaigns"
CROSS JOIN (VALUES
  ('Abençoado', 'benefit'), ('Concentrando', 'benefit'), ('Invisível', 'benefit'),
  ('Agarrado', 'harm'), ('Amedrontado', 'harm'), ('Atordoado', 'harm'), ('Caído', 'harm'),
  ('Cego', 'harm'), ('Envenenado', 'harm'), ('Imobilizado', 'harm'), ('Paralisado', 'harm')
) AS "initial"("name", "tone");
