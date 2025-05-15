CREATE TABLE "round_admins" (
	"round_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "round_admins_round_id_user_id_pk" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"application_period_start" timestamp with time zone NOT NULL,
	"application_period_end" timestamp with time zone NOT NULL,
	"voting_period_start" timestamp with time zone NOT NULL,
	"voting_period_end" timestamp with time zone NOT NULL,
	"results_period_start" timestamp with time zone NOT NULL,
	"application_format" jsonb NOT NULL,
	"voting_config" jsonb NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;