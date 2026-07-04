CREATE TABLE "distribution_list_office_rules" (
	"list_id" integer NOT NULL,
	"office_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_office_rules_list_id_office_id_pk" PRIMARY KEY("list_id","office_id")
);
--> statement-breakpoint
ALTER TABLE "distribution_list_office_rules" ADD CONSTRAINT "distribution_list_office_rules_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_office_rules" ADD CONSTRAINT "distribution_list_office_rules_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;