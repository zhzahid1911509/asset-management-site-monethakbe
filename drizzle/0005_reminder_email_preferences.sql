CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"reminder_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"due_on" date NOT NULL,
	"advance_days" integer NOT NULL,
	"scheduled_on" date NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "notification_occurrence_uq" UNIQUE("family_id","user_id","reminder_id","due_on","advance_days"),
	CONSTRAINT "notification_advance_ck" CHECK ("notification_deliveries"."advance_days" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"categories" jsonb NOT NULL,
	"advance_days" jsonb NOT NULL,
	"time_zone" text NOT NULL,
	"send_at" text NOT NULL,
	"quiet_enabled" boolean NOT NULL,
	"quiet_start" text NOT NULL,
	"quiet_end" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_uq" UNIQUE("family_id","user_id"),
	CONSTRAINT "notification_preference_version_ck" CHECK ("notification_preferences"."version">0)
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_job_id_email_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."email_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_family_id_record_id_reminder_id_reminders_family_id_record_id_id_fk" FOREIGN KEY ("family_id","record_id","reminder_id") REFERENCES "public"."reminders"("family_id","record_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_family_id_user_id_memberships_family_id_user_id_fk" FOREIGN KEY ("family_id","user_id") REFERENCES "public"."memberships"("family_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_family_id_user_id_memberships_family_id_user_id_fk" FOREIGN KEY ("family_id","user_id") REFERENCES "public"."memberships"("family_id","user_id") ON DELETE no action ON UPDATE no action;