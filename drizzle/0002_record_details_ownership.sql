CREATE TABLE "record_detail_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"record_version" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detail_revision_uq" UNIQUE("family_id","record_id","record_version"),
	CONSTRAINT "detail_object_ck" CHECK (jsonb_typeof("record_detail_history"."details") = 'object'),
	CONSTRAINT "detail_revision_ck" CHECK ("record_detail_history"."record_version" > 0 and "record_detail_history"."schema_version" = 1)
);
--> statement-breakpoint
CREATE TABLE "ownership_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"record_version" integer NOT NULL,
	"family_share" numeric(9, 6) NOT NULL,
	"owners" jsonb NOT NULL,
	"as_of" date,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_revision_uq" UNIQUE("family_id","record_id","record_version"),
	CONSTRAINT "ownership_share_ck" CHECK ("ownership_history"."family_share" >= 0 and "ownership_history"."family_share" <= 100),
	CONSTRAINT "ownership_owners_ck" CHECK (jsonb_typeof("ownership_history"."owners") = 'array' and jsonb_array_length("ownership_history"."owners") <= 20),
	CONSTRAINT "ownership_revision_ck" CHECK ("ownership_history"."record_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "owners" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "ownership_as_of" date;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "record_detail_history" ADD CONSTRAINT "record_detail_history_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_detail_history" ADD CONSTRAINT "record_detail_history_family_id_record_id_records_family_id_id_fk" FOREIGN KEY ("family_id","record_id") REFERENCES "public"."records"("family_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_history" ADD CONSTRAINT "ownership_history_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_history" ADD CONSTRAINT "ownership_history_family_id_record_id_records_family_id_id_fk" FOREIGN KEY ("family_id","record_id") REFERENCES "public"."records"("family_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve the pre-upgrade state without inventing an effective ownership date.
INSERT INTO record_detail_history (family_id, record_id, record_version, details, created_by)
SELECT family_id, id, version, details, created_by FROM records;
--> statement-breakpoint
INSERT INTO ownership_history (family_id, record_id, record_version, family_share, owners, as_of, reason, created_by)
SELECT a.family_id, a.record_id, r.version, a.ownership_percent, a.owners, NULL,
  'Pre-0.3.0 family share; effective date unknown', r.created_by
FROM assets a JOIN records r ON r.family_id = a.family_id AND r.id = a.record_id;
