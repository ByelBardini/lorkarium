ALTER TABLE "sheet_templates" ADD COLUMN "files" jsonb;--> statement-breakpoint
UPDATE "sheet_templates" SET "files" = jsonb_build_array(jsonb_build_object('path', 'index.html', 'content', "html"), jsonb_build_object('path', 'style.css', 'content', "css"), jsonb_build_object('path', 'script.js', 'content', "js"));--> statement-breakpoint
ALTER TABLE "sheet_templates" ALTER COLUMN "files" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sheet_templates" DROP COLUMN "html";--> statement-breakpoint
ALTER TABLE "sheet_templates" DROP COLUMN "css";--> statement-breakpoint
ALTER TABLE "sheet_templates" DROP COLUMN "js";