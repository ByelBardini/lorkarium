CREATE TYPE "public"."invitation_origin" AS ENUM('admin', 'self');--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "origin" "invitation_origin" DEFAULT 'admin' NOT NULL;