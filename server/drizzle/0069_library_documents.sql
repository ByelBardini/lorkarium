CREATE TABLE "library_document_actions" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "library_document_actions_campaign_id_user_id_action_id_pk" PRIMARY KEY("campaign_id","user_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "library_document_assets" (
	"campaign_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"in_content" boolean DEFAULT false NOT NULL,
	CONSTRAINT "library_document_assets_campaign_id_document_id_asset_id_pk" PRIMARY KEY("campaign_id","document_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "library_document_owners" (
	"campaign_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "library_document_owners_campaign_id_document_id_user_id_pk" PRIMARY KEY("campaign_id","document_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "library_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"visibility" "scene_visibility" DEFAULT 'private' NOT NULL,
	"content" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_documents_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "library_documents_name_length" CHECK (char_length("library_documents"."name") between 1 and 60),
	CONSTRAINT "library_documents_version_nonnegative" CHECK ("library_documents"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "library_document_actions" ADD CONSTRAINT "library_document_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_document_assets" ADD CONSTRAINT "library_document_assets_campaign_id_document_id_library_documents_campaign_id_id_fk" FOREIGN KEY ("campaign_id","document_id") REFERENCES "public"."library_documents"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_document_assets" ADD CONSTRAINT "library_document_assets_campaign_id_asset_id_assets_campaign_id_id_fk" FOREIGN KEY ("campaign_id","asset_id") REFERENCES "public"."assets"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_document_owners" ADD CONSTRAINT "library_document_owners_campaign_id_document_id_library_documents_campaign_id_id_fk" FOREIGN KEY ("campaign_id","document_id") REFERENCES "public"."library_documents"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_document_owners" ADD CONSTRAINT "library_document_owners_campaign_id_user_id_campaign_members_campaign_id_user_id_fk" FOREIGN KEY ("campaign_id","user_id") REFERENCES "public"."campaign_members"("campaign_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE set null ("folder_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_document_assets_asset_idx" ON "library_document_assets" USING btree ("campaign_id","asset_id");--> statement-breakpoint
CREATE INDEX "library_document_owners_user_idx" ON "library_document_owners" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "library_documents_folder_idx" ON "library_documents" USING btree ("campaign_id","folder_id");