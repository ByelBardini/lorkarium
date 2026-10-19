CREATE TABLE "lights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"light_order" integer GENERATED ALWAYS AS IDENTITY (sequence name "lights_light_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"x" numeric(8, 2) NOT NULL,
	"y" numeric(8, 2) NOT NULL,
	"bright" numeric(6, 2) NOT NULL,
	"dim" numeric(6, 2) NOT NULL,
	"lit" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lights_range" CHECK ("lights"."bright" BETWEEN 0 AND 100 AND "lights"."dim" BETWEEN 0 AND 100),
	CONSTRAINT "lights_position" CHECK ("lights"."x" >= 0 AND "lights"."y" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lights" ADD CONSTRAINT "lights_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lights_scene_id_idx" ON "lights" USING btree ("scene_id");