ALTER TABLE "application_categories" DROP CONSTRAINT "application_categories_round_id_name_draft_id_pk";--> statement-breakpoint
ALTER TABLE "application_categories" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "application_categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "application_forms" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "application_category_name_unique_index" ON "application_categories" USING btree ("draft_id",lower("name"));