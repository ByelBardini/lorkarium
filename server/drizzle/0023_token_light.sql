ALTER TABLE "tokens" ADD COLUMN "light_bright" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_dim" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_lit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_light_range" CHECK (("tokens"."light_bright" IS NULL AND "tokens"."light_dim" IS NULL) OR ("tokens"."light_bright" IS NOT NULL AND "tokens"."light_dim" IS NOT NULL AND "tokens"."light_bright" BETWEEN 0 AND 100 AND "tokens"."light_dim" BETWEEN 0 AND 100));