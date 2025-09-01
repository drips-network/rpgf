CREATE TABLE "application_answers" (
	"application_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_answers_application_id_field_id_pk" PRIMARY KEY("application_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "application_categories" (
	"draft_id" uuid NOT NULL,
	"round_id" uuid,
	"name" varchar(255) NOT NULL,
	"application_form_id" uuid NOT NULL,
	CONSTRAINT "application_categories_round_id_name_draft_id_pk" PRIMARY KEY("round_id","name","draft_id")
);
--> statement-breakpoint
CREATE TABLE "application_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"slug" varchar(255),
	"order" integer NOT NULL,
	"properties" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"round_id" uuid,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_forms_round_id_unique" UNIQUE("round_id")
);
--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_field_id_application_form_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."application_form_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_draft_id_round_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."round_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_application_form_id_application_forms_id_fk" FOREIGN KEY ("application_form_id") REFERENCES "public"."application_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_form_fields" ADD CONSTRAINT "application_form_fields_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_draft_id_round_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."round_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_field_slug_unique_index" ON "application_form_fields" USING btree ("form_id",lower("slug")) WHERE "application_form_fields"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "applications" DROP COLUMN "fields";--> statement-breakpoint
ALTER TABLE "rounds" DROP COLUMN "application_format";