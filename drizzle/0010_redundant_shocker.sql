CREATE TABLE "linked_drip_lists" (
	"round_id" uuid NOT NULL,
	"drip_list_id" varchar(255) NOT NULL,
	CONSTRAINT "linked_drip_lists_round_id_drip_list_id_pk" PRIMARY KEY("round_id","drip_list_id")
);
--> statement-breakpoint
ALTER TABLE "linked_drip_lists" ADD CONSTRAINT "linked_drip_lists_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;