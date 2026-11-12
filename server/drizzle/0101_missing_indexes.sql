CREATE INDEX "active_conditions_condition_idx" ON "active_conditions" USING btree ("condition_id");--> statement-breakpoint
CREATE INDEX "campaigns_visibility_created_idx" ON "campaigns" USING btree ("visibility","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_active_scene_idx" ON "campaigns" USING btree ("active_scene_id") WHERE "campaigns"."active_scene_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "token_sheets_token_only_idx" ON "token_sheets" USING btree ("token_id") WHERE "token_sheets"."token_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tokens_active_form_idx" ON "tokens" USING btree ("active_form_id") WHERE "tokens"."active_form_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tokens_character_idx" ON "tokens" USING btree ("character_id") WHERE "tokens"."character_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id") WHERE "users"."avatar_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_dice_texture_idx" ON "users" USING btree ("dice_texture_id") WHERE "users"."dice_texture_id" IS NOT NULL;