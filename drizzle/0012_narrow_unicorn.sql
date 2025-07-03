ALTER TABLE "rounds" ADD COLUMN "results_calculated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "results_published" boolean DEFAULT false NOT NULL;