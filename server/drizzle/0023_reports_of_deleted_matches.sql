-- RES-8 (Q-21): deleting a match now deletes its match reports and their tracks. This tidies what
-- servers before it left: a match report whose match is deleted, or isn't in the account at all, is
-- marked deleted the way the API deletes a record (a new version and sync number), so phones drop
-- it at their next sync; and the tracks of such reports are removed. A report that names no match
-- is left alone, and so is everything else. Running it again changes nothing.
UPDATE "records" AS "r"
SET "version" = "r"."version" + 1, "seq" = nextval('record_seq'), "updated_at" = now(), "deleted_at" = now()
WHERE "r"."type" = 'matchRecord'
  AND "r"."deleted_at" IS NULL
  AND "r"."data"->>'matchId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "records" AS "m"
    WHERE "m"."user_id" = "r"."user_id" AND "m"."type" = 'match' AND "m"."deleted_at" IS NULL
      AND "m"."id"::text = lower("r"."data"->>'matchId')
  );
--> statement-breakpoint
DELETE FROM "match_track" AS "t"
USING "records" AS "r"
WHERE "r"."user_id" = "t"."user_id" AND "r"."id" = "t"."match_record_id" AND "r"."type" = 'matchRecord'
  AND "r"."data"->>'matchId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "records" AS "m"
    WHERE "m"."user_id" = "r"."user_id" AND "m"."type" = 'match' AND "m"."deleted_at" IS NULL
      AND "m"."id"::text = lower("r"."data"->>'matchId')
  );
