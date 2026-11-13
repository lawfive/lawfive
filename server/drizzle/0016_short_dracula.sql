CREATE TABLE "merged_id" (
	"user_id" text NOT NULL,
	"old_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"new_id" uuid NOT NULL,
	"venue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merged_id_user_id_old_id_pk" PRIMARY KEY("user_id","old_id")
);
--> statement-breakpoint
ALTER TABLE "merged_id" ADD CONSTRAINT "merged_id_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;