ALTER TABLE "advance_particulars" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_particulars" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "advance_particulars" DROP COLUMN "other_description";