-- SET-5 (2026-11-11): a short name nobody typed is now made from both team names everywhere (the
-- watch's download, the website, Try a match, the phones), and only a typed one is stored. The website's
-- match form used to store its suggestion, so a match whose names changed later (an import, a calendar
-- feed, the API) kept the old one. This removes a match's stored short name when it's one a form or a
-- watch would have made rather than one typed: what the form suggested for the match's current names
-- (the pair rule of schema/src/shortNames.ts: L84_Roach v L84_Smith gives ROA and SMI; or the plain
-- first three letters or digits of the name), and the placeholders HOM for home and AWA or AWY for away
-- ("Home Team" v "Away Team" saved before the teams were known). Such a match is changed the way the
-- API changes a record (a new version and sync number), so phones take it at their next sync, and its
-- short names follow its names from now on. A short name that differs from these stays, and so does
-- everything else. Running it again changes nothing.
--
-- The helpers live in pg_temp for this migration only. Letters and digits are [:alnum:], which follows
-- the database's locale: where it doesn't know a letter, the short name made here differs from the
-- stored one, and that short name is kept.
CREATE FUNCTION pg_temp.lawfive_words(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(array_agg(w ORDER BY n), '{}')
    FROM regexp_split_to_table(coalesce(name, ''), '[^[:alnum:]]+') WITH ORDINALITY AS t(w, n)
    WHERE w <> ''
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.lawfive_first_three(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT nullif(upper(left(array_to_string(pg_temp.lawfive_words(name), ''), 3)), '')
$$;
--> statement-breakpoint
-- suggestAliases: the first three of each; when those match, the words both names start with are skipped.
CREATE FUNCTION pg_temp.lawfive_suggest(home text, away text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    simple_home text := pg_temp.lawfive_first_three(home);
    simple_away text := pg_temp.lawfive_first_three(away);
    home_words text[] := pg_temp.lawfive_words(home);
    away_words text[] := pg_temp.lawfive_words(away);
    shared int := 0;
    distinct_home text;
    distinct_away text;
BEGIN
    IF simple_home IS NULL OR simple_home IS DISTINCT FROM simple_away THEN
        RETURN ARRAY[simple_home, simple_away];
    END IF;
    WHILE shared < cardinality(home_words) AND shared < cardinality(away_words)
        AND lower(home_words[shared + 1]) = lower(away_words[shared + 1]) LOOP
        shared := shared + 1;
    END LOOP;
    distinct_home := coalesce(pg_temp.lawfive_first_three(array_to_string(home_words[shared + 1:], ' ')), simple_home);
    distinct_away := coalesce(pg_temp.lawfive_first_three(array_to_string(away_words[shared + 1:], ' ')), simple_away);
    IF distinct_home IS DISTINCT FROM distinct_away THEN
        RETURN ARRAY[distinct_home, distinct_away];
    END IF;
    RETURN ARRAY[simple_home, simple_away];
END
$$;
--> statement-breakpoint
-- Whether a side's stored short name is one made for it rather than typed.
CREATE FUNCTION pg_temp.lawfive_made(home text, away text, side text, short text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(
        short = (pg_temp.lawfive_suggest(home, away))[CASE WHEN side = 'home' THEN 1 ELSE 2 END]
        OR short = pg_temp.lawfive_first_three(CASE WHEN side = 'home' THEN home ELSE away END)
        OR (side = 'home' AND short = 'HOM')
        OR (side = 'away' AND short IN ('AWA', 'AWY')),
        false)
$$;
--> statement-breakpoint
UPDATE "records" AS "r"
SET "version" = "r"."version" + 1, "seq" = nextval('record_seq'), "updated_at" = now(),
    "data" = "r"."data"
        #- (CASE WHEN "f"."home" THEN '{home,alias}' ELSE '{}' END)::text[]
        #- (CASE WHEN "f"."away" THEN '{away,alias}' ELSE '{}' END)::text[]
FROM (
    SELECT "user_id", "id",
        pg_temp.lawfive_made("data"->'home'->>'name', "data"->'away'->>'name', 'home', "data"->'home'->>'alias') AS "home",
        pg_temp.lawfive_made("data"->'home'->>'name', "data"->'away'->>'name', 'away', "data"->'away'->>'alias') AS "away"
    FROM "records"
    WHERE "type" = 'match' AND "deleted_at" IS NULL
      AND ("data"->'home'->>'alias' IS NOT NULL OR "data"->'away'->>'alias' IS NOT NULL)
) AS "f"
WHERE "r"."user_id" = "f"."user_id" AND "r"."id" = "f"."id" AND ("f"."home" OR "f"."away");
--> statement-breakpoint
DROP FUNCTION pg_temp.lawfive_made(text, text, text, text);
--> statement-breakpoint
DROP FUNCTION pg_temp.lawfive_suggest(text, text);
--> statement-breakpoint
DROP FUNCTION pg_temp.lawfive_first_three(text);
--> statement-breakpoint
DROP FUNCTION pg_temp.lawfive_words(text);
