ALTER TABLE "users" ADD COLUMN "paid_plan" "user_plan";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "paid_plan_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_paid_plan_pair" CHECK (("users"."paid_plan" IS NULL) = ("users"."paid_plan_until" IS NULL));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_paid_plan_sold" CHECK ("users"."paid_plan" IS NULL OR "users"."paid_plan" IN ('apoiador', 'narrador', 'lenda'));