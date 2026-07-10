ALTER TABLE "distribution_lists" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "ranks" ADD COLUMN "updated_by" text;--> statement-breakpoint
CREATE INDEX "assignments_groupId_idx" ON "assignments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "assignments_officeId_idx" ON "assignments" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "groups_parentId_idx" ON "groups" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "persons_rankId_idx" ON "persons" USING btree ("rank_id");