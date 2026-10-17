CREATE TYPE "public"."token_layer" AS ENUM('tokens', 'objects', 'background');--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "layer" "token_layer" DEFAULT 'tokens' NOT NULL;