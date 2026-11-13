CREATE TABLE "match_share" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_share" ADD CONSTRAINT "match_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_share_match" ON "match_share" USING btree ("user_id","match_id");