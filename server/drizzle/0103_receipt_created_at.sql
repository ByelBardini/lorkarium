ALTER TABLE "library_document_actions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sheet_actions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "library_document_actions_created_idx" ON "library_document_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sheet_actions_created_idx" ON "sheet_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "two_factor_challenges_expires_at_idx" ON "two_factor_challenges" USING btree ("expires_at");