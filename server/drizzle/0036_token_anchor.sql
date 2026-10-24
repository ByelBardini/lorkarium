ALTER TABLE "member_cards" ADD COLUMN "anchor_token_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "anchor_token_id" uuid;--> statement-breakpoint
ALTER TABLE "member_cards" ADD CONSTRAINT "member_cards_anchor_token_id_tokens_id_fk" FOREIGN KEY ("anchor_token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_anchor_token_id_tokens_id_fk" FOREIGN KEY ("anchor_token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cards" ADD CONSTRAINT "member_cards_anchor_token_id_unique" UNIQUE("anchor_token_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_id_anchor_token_id_unique" UNIQUE("scene_id","anchor_token_id");