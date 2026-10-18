ALTER TABLE "liability_payments" ADD CONSTRAINT "payment_family_record_uq" UNIQUE("family_id","record_id","id");
--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"principal" numeric(24, 2) NOT NULL,
	"balance_before" numeric(24, 2) NOT NULL,
	"balance_after" numeric(24, 2) NOT NULL,
	"reversed_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reversals_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "reversal_balance_ck" CHECK ("payment_reversals"."principal" >= 0 and "payment_reversals"."balance_before" >= 0 and "payment_reversals"."balance_after" < 'Infinity'::numeric and "payment_reversals"."balance_after" = "payment_reversals"."balance_before" + "payment_reversals"."principal")
);
--> statement-breakpoint
CREATE TABLE "reminder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"reminder_id" uuid NOT NULL,
	"record_version" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_event_version_uq" UNIQUE("family_id","record_id","record_version"),
	CONSTRAINT "reminder_event_action_ck" CHECK ("reminder_events"."action" in ('created','updated','complete','cancel','reopen'))
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"due_on" date NOT NULL,
	"recurrence" text NOT NULL,
	"anchor_day" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_family_record_uq" UNIQUE("family_id","record_id","id"),
	CONSTRAINT "reminder_anchor_ck" CHECK ("reminders"."anchor_day" between 1 and 31),
	CONSTRAINT "reminder_status_ck" CHECK ("reminders"."status" in ('active','completed','cancelled')),
	CONSTRAINT "reminder_category_ck" CHECK ("reminders"."category" in ('maturity','renewal','payment','maintenance','valuation','family-task','other')),
	CONSTRAINT "reminder_recurrence_ck" CHECK ("reminders"."recurrence" in ('none','daily','weekly','monthly','quarterly','yearly'))
);
--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_family_id_record_id_payment_id_liability_payments_family_id_record_id_id_fk" FOREIGN KEY ("family_id","record_id","payment_id") REFERENCES "public"."liability_payments"("family_id","record_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_family_id_record_id_reminder_id_reminders_family_id_record_id_id_fk" FOREIGN KEY ("family_id","record_id","reminder_id") REFERENCES "public"."reminders"("family_id","record_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_family_id_record_id_records_family_id_id_fk" FOREIGN KEY ("family_id","record_id") REFERENCES "public"."records"("family_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_due_idx" ON "reminders" USING btree ("family_id","status","due_on");
