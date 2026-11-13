CREATE TABLE "risk_alert" (
	"user_id" text NOT NULL,
	"match_id" uuid NOT NULL,
	"kickoff" timestamp with time zone NOT NULL,
	"told" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "risk_alert_user_id_match_id_pk" PRIMARY KEY("user_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "push_handle" text;--> statement-breakpoint
ALTER TABLE "risk_alert" ADD CONSTRAINT "risk_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;