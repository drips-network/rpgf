CREATE TABLE "treova_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"treova_idempotency_key" varchar(255) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treova_webhooks_treova_idempotency_key_unique" UNIQUE("treova_idempotency_key")
);
