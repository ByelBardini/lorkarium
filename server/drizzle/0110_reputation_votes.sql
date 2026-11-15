CREATE TABLE "reputation_votes" (
	"voter_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reputation_votes_voter_id_target_id_pk" PRIMARY KEY("voter_id","target_id"),
	CONSTRAINT "reputation_votes_value" CHECK ("reputation_votes"."value" in (-1, 1)),
	CONSTRAINT "reputation_votes_not_self" CHECK ("reputation_votes"."voter_id" <> "reputation_votes"."target_id")
);
--> statement-breakpoint
ALTER TABLE "reputation_votes" ADD CONSTRAINT "reputation_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_votes" ADD CONSTRAINT "reputation_votes_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reputation_votes_target_idx" ON "reputation_votes" USING btree ("target_id");