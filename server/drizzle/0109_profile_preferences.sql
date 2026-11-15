ALTER TABLE "users" ADD COLUMN "game_systems" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "play_schedule" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_game_systems_length" CHECK (char_length("users"."game_systems") <= 300);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_play_schedule_length" CHECK (char_length("users"."play_schedule") <= 200);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contact_length" CHECK (char_length("users"."contact") <= 200);