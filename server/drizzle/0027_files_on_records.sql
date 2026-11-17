ALTER TABLE "attachment" ADD COLUMN "kind" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "thumb_size" integer;