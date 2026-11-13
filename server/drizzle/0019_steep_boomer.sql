CREATE TABLE "sign_in_lock" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"last_failure_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"notified_at" timestamp with time zone
);
