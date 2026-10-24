ALTER TABLE "active_conditions" ADD COLUMN "stacks" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "condition_definitions" ADD COLUMN "max_stacks" integer;