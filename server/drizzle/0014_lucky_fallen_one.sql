CREATE TABLE "app_sign_in" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"device_name" text,
	CONSTRAINT "app_sign_in_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "app_sign_in" ADD CONSTRAINT "app_sign_in_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;