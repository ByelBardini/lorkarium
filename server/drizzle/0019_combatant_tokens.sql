CREATE TABLE "combatant_tokens" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"combatant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "combatants" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "combatant_tokens" ADD CONSTRAINT "combatant_tokens_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatant_tokens" ADD CONSTRAINT "combatant_tokens_combatant_id_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combatant_tokens_combatant_idx" ON "combatant_tokens" USING btree ("combatant_id");--> statement-breakpoint
-- Each combatant of an existing combat keeps its token, now through the link table.
INSERT INTO "combatant_tokens" ("token_id", "combatant_id") SELECT "token_id", "id" FROM "combatants";