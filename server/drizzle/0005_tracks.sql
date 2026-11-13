CREATE TABLE "match_track" (
	"user_id" text NOT NULL,
	"match_record_id" uuid NOT NULL,
	"source" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_track_user_id_match_record_id_pk" PRIMARY KEY("user_id","match_record_id")
);
--> statement-breakpoint
ALTER TABLE "match_track" ADD CONSTRAINT "match_track_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;