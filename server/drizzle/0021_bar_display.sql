CREATE TYPE "public"."bar_display" AS ENUM('number', 'percent');--> statement-breakpoint
ALTER TABLE "token_bars" ADD COLUMN "display" "bar_display" DEFAULT 'number' NOT NULL;