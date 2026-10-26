ALTER TABLE "users" ADD COLUMN "dice_texture_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dice_number_color" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_dice_number_color_hex" CHECK ("users"."dice_number_color" ~ '^#[0-9a-f]{6}$');