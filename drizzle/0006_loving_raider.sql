ALTER TYPE "public"."audit_log_action" ADD VALUE 'custom_dataset_created';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'custom_dataset_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'custom_dataset_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'custom_dataset_uploaded';