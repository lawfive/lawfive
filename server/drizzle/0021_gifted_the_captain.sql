CREATE TABLE "assignor_calendar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"system" text NOT NULL,
	"url" text NOT NULL,
	"link" text NOT NULL,
	"notify" boolean NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"next_read_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"etag" text,
	"last_modified" text,
	"last_result" jsonb,
	"problem" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"stopped_at" timestamp with time zone,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignor_event" (
	"calendar_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"match_id" uuid NOT NULL,
	"raw" jsonb NOT NULL,
	"hash" text NOT NULL,
	"kickoff" timestamp with time zone NOT NULL,
	"canceled" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "assignor_event_calendar_id_uid_pk" PRIMARY KEY("calendar_id","uid")
);
--> statement-breakpoint
ALTER TABLE "assignor_calendar" ADD CONSTRAINT "assignor_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignor_event" ADD CONSTRAINT "assignor_event_calendar_id_assignor_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."assignor_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignor_calendar_user" ON "assignor_calendar" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assignor_calendar_due" ON "assignor_calendar" USING btree ("active","next_read_at");