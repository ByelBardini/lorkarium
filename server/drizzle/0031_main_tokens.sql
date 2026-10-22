CREATE TABLE "main_tokens" (
	"scene_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "main_tokens_scene_id_user_id_pk" PRIMARY KEY("scene_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "main_tokens" ADD CONSTRAINT "main_tokens_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_tokens" ADD CONSTRAINT "main_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_tokens" ADD CONSTRAINT "main_tokens_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "main_tokens_token_id_idx" ON "main_tokens" USING btree ("token_id");