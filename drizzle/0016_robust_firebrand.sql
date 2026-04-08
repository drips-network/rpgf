ALTER TABLE "application_categories" ADD COLUMN "external_voting_tool_name" varchar(255);--> statement-breakpoint
ALTER TABLE "application_categories" ADD COLUMN "external_voting_tool_url" varchar(510);--> statement-breakpoint
ALTER TABLE "application_categories" ADD COLUMN "external_voting_tool_secret" varchar(255);