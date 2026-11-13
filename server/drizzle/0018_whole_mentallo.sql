CREATE TABLE "account_plan" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"ends_on" text,
	"then_plan_id" uuid,
	"reminded" integer
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"limits" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "plan_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_code" text,
	"from_name" text,
	"to_code" text NOT NULL,
	"to_name" text NOT NULL,
	"reason" text NOT NULL,
	"by_name" text,
	"ends_at" timestamp with time zone,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "invite" ADD COLUMN "plan_days" integer;--> statement-breakpoint
ALTER TABLE "account_plan" ADD CONSTRAINT "account_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_plan" ADD CONSTRAINT "account_plan_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_plan" ADD CONSTRAINT "account_plan_then_plan_id_plan_id_fk" FOREIGN KEY ("then_plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_change" ADD CONSTRAINT "plan_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_plan_ends" ON "account_plan" USING btree ("ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_default" ON "plan" USING btree ("is_default") WHERE "plan"."is_default";--> statement-breakpoint
CREATE INDEX "plan_change_user" ON "plan_change" USING btree ("user_id","at");--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE set null ON UPDATE no action;