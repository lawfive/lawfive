CREATE TABLE "watch_track_chunk" (
	"user_id" text NOT NULL,
	"created" bigint NOT NULL,
	"index" integer NOT NULL,
	"count" integer NOT NULL,
	"start" bigint NOT NULL,
	"device" text,
	"data" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "watch_track_chunk_user_id_created_index_pk" PRIMARY KEY("user_id","created","index")
);
--> statement-breakpoint
ALTER TABLE "watch_track_chunk" ADD CONSTRAINT "watch_track_chunk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;