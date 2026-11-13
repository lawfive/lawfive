ALTER TABLE "session" ADD COLUMN "scope" text;--> statement-breakpoint
-- SEC-13: watches linked before this become watch-only links, so nobody links again.
UPDATE "session" SET "scope" = 'watch' WHERE "id" IN (SELECT "session_id" FROM "device" WHERE "kind" IN ('garmin', 'wearos', 'applewatch'));
