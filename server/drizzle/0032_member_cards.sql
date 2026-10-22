CREATE TABLE "member_cards" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"character_name" text,
	"armor_class" smallint,
	"difficulty_class" smallint,
	"note_one" text,
	"note_two" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_cards_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id"),
	CONSTRAINT "member_cards_character_name_length" CHECK (char_length("member_cards"."character_name") <= 40),
	CONSTRAINT "member_cards_note_one_length" CHECK (char_length("member_cards"."note_one") <= 80),
	CONSTRAINT "member_cards_note_two_length" CHECK (char_length("member_cards"."note_two") <= 80),
	CONSTRAINT "member_cards_armor_class_range" CHECK ("member_cards"."armor_class" BETWEEN 0 AND 999),
	CONSTRAINT "member_cards_difficulty_class_range" CHECK ("member_cards"."difficulty_class" BETWEEN 0 AND 999)
);
--> statement-breakpoint
ALTER TABLE "member_cards" ADD CONSTRAINT "member_cards_member_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;