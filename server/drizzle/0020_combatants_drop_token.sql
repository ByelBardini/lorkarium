ALTER TABLE "combatants" DROP CONSTRAINT "combatants_combat_token_unique";--> statement-breakpoint
ALTER TABLE "combatants" DROP CONSTRAINT "combatants_token_id_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "combatants" DROP COLUMN "token_id";