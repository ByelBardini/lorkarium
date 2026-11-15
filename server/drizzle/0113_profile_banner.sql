ALTER TABLE "users" ADD COLUMN "banner_id" uuid;--> statement-breakpoint
CREATE INDEX "users_banner_idx" ON "users" USING btree ("banner_id") WHERE "users"."banner_id" IS NOT NULL;