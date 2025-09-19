ALTER TABLE "application_answers" DROP CONSTRAINT "application_answers_application_version_id_application_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "application_categories" DROP CONSTRAINT "application_categories_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "application_form_fields" DROP CONSTRAINT "application_form_fields_form_id_application_forms_id_fk";
--> statement-breakpoint
ALTER TABLE "application_forms" DROP CONSTRAINT "application_forms_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "application_kyc_requests" DROP CONSTRAINT "application_kyc_requests_application_id_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "application_kyc_requests" DROP CONSTRAINT "application_kyc_requests_kyc_request_id_kyc_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "application_versions" DROP CONSTRAINT "application_versions_application_id_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "ballots" DROP CONSTRAINT "ballots_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "kyc_requests" DROP CONSTRAINT "kyc_requests_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "linked_drip_lists" DROP CONSTRAINT "linked_drip_lists_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "results" DROP CONSTRAINT "results_application_id_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "round_admins" DROP CONSTRAINT "round_admins_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_version_id_application_versions_id_fk" FOREIGN KEY ("application_version_id") REFERENCES "public"."application_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_categories" ADD CONSTRAINT "application_categories_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_form_fields" ADD CONSTRAINT "application_form_fields_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_kyc_requests" ADD CONSTRAINT "application_kyc_requests_kyc_request_id_kyc_requests_id_fk" FOREIGN KEY ("kyc_request_id") REFERENCES "public"."kyc_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_versions" ADD CONSTRAINT "application_versions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_requests" ADD CONSTRAINT "kyc_requests_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_drip_lists" ADD CONSTRAINT "linked_drip_lists_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_voters" ADD CONSTRAINT "round_voters_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_voters" ADD CONSTRAINT "round_voters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;