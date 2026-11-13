CREATE TABLE "match_weather" (
	"user_id" text NOT NULL,
	"match_id" uuid NOT NULL,
	"kickoff" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_weather_user_id_match_id_pk" PRIMARY KEY("user_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "weather_forecast" (
	"cell" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"hourly" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_weather" ADD CONSTRAINT "match_weather_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;