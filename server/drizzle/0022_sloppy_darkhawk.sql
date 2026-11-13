CREATE TABLE "watch_copy" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"match_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "watch_copy_session_id_match_id_pk" PRIMARY KEY("session_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "watch_copy" ADD CONSTRAINT "watch_copy_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_copy" ADD CONSTRAINT "watch_copy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_copy_user" ON "watch_copy" USING btree ("user_id");