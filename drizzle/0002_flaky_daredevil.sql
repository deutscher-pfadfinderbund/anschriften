CREATE TYPE "public"."mail_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "mail_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mail_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" text NOT NULL,
	"list_id" integer,
	"subject" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"status" "mail_status" NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "mail_log" ADD CONSTRAINT "mail_log_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE set null ON UPDATE no action;