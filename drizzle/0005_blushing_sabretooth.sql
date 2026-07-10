CREATE TABLE "distribution_list_group_rules" (
	"list_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_group_rules_list_id_group_id_pk" PRIMARY KEY("list_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "distribution_list_rank_rules" (
	"list_id" integer NOT NULL,
	"rank_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_rank_rules_list_id_rank_id_pk" PRIMARY KEY("list_id","rank_id")
);
--> statement-breakpoint
ALTER TABLE "distribution_list_group_rules" ADD CONSTRAINT "distribution_list_group_rules_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_group_rules" ADD CONSTRAINT "distribution_list_group_rules_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_rank_rules" ADD CONSTRAINT "distribution_list_rank_rules_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_rank_rules" ADD CONSTRAINT "distribution_list_rank_rules_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE cascade ON UPDATE no action;