CREATE TABLE "results" (
	"round_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"method" varchar(255) NOT NULL,
	"result" integer NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "results_round_id_application_id_pk" PRIMARY KEY("round_id","application_id")
);
--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;