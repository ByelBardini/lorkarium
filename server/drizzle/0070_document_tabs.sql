CREATE TYPE "public"."document_tab_visibility" AS ENUM('document', 'masters');--> statement-breakpoint
CREATE TABLE "library_document_tabs" (
	"campaign_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"visibility" "document_tab_visibility" DEFAULT 'document' NOT NULL,
	"content" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_document_tabs_campaign_id_id_pk" PRIMARY KEY("campaign_id","id"),
	CONSTRAINT "library_document_tabs_document_tab_unique" UNIQUE("campaign_id","document_id","id"),
	CONSTRAINT "library_document_tabs_position_unique" UNIQUE("document_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "library_document_tabs_name_length" CHECK (char_length("library_document_tabs"."name") between 1 and 40),
	CONSTRAINT "library_document_tabs_position_nonnegative" CHECK ("library_document_tabs"."position" >= 0),
	CONSTRAINT "library_document_tabs_version_nonnegative" CHECK ("library_document_tabs"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "library_document_tabs" ADD CONSTRAINT "library_document_tabs_document_fk" FOREIGN KEY ("campaign_id","document_id") REFERENCES "public"."library_documents"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Each document's body becomes its first tab, "Geral", before the column goes away: one source of truth.
INSERT INTO "library_document_tabs" ("campaign_id", "document_id", "name", "position", "visibility", "content", "schema_version", "version", "created_at", "updated_at")
SELECT "campaign_id", "id", 'Geral', 0, 'document'::document_tab_visibility, "content", "schema_version", 0, "created_at", "updated_at" FROM "library_documents";--> statement-breakpoint
ALTER TABLE "library_documents" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "library_documents" DROP COLUMN "schema_version";