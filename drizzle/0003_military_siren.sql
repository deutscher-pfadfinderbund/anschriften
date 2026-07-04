ALTER TABLE "assignments" DROP CONSTRAINT "assignments_person_group_office_key";--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "end_date" date;--> statement-breakpoint
-- Hand-edited: `NULLS NOT DISTINCT` added because drizzle's uniqueIndex builder cannot
-- emit it. Without it two active office-less rows (office_id NULL) of the same group
-- would no longer collide — the old UNIQUE constraint had NULLS NOT DISTINCT and we must
-- preserve that semantics for the active half.
CREATE UNIQUE INDEX "assignments_active_person_group_office_key" ON "assignments" USING btree ("person_id","group_id","office_id") NULLS NOT DISTINCT WHERE "assignments"."end_date" is null;