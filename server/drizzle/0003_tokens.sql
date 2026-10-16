CREATE TYPE "public"."bar_color" AS ENUM('gold', 'steel', 'ember', 'moss', 'ash');--> statement-breakpoint
CREATE TYPE "public"."bar_visibility" AS ENUM('everyone', 'controllers');--> statement-breakpoint
CREATE TYPE "public"."token_side" AS ENUM('ally', 'enemy', 'neutral');--> statement-breakpoint
CREATE TABLE "token_bars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"current" integer NOT NULL,
	"max" integer NOT NULL,
	"color" "bar_color" NOT NULL,
	"visibility" "bar_visibility" NOT NULL,
	CONSTRAINT "token_bars_token_id_position_unique" UNIQUE("token_id","position")
);
--> statement-breakpoint
CREATE TABLE "token_controllers" (
	"token_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "token_controllers_token_id_user_id_pk" PRIMARY KEY("token_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"side" "token_side" NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"col" integer NOT NULL,
	"row" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_bars" ADD CONSTRAINT "token_bars_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_controllers" ADD CONSTRAINT "token_controllers_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_controllers" ADD CONSTRAINT "token_controllers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_scene_id_idx" ON "tokens" USING btree ("scene_id");