CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"request_key" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scanned_at" timestamp with time zone,
	CONSTRAINT "document_revision_uq" UNIQUE("document_id","revision"),
	CONSTRAINT "document_request_uq" UNIQUE("family_id","created_by","request_key"),
	CONSTRAINT "document_size_ck" CHECK ("document_versions"."size" > 0 and "document_versions"."size" <= 10485760),
	CONSTRAINT "document_status_ck" CHECK ("document_versions"."status" in ('pending','scanning','available','rejected','failed','discarded')),
	CONSTRAINT "document_clean_ck" CHECK ("document_versions"."status" <> 'available' or "document_versions"."scanned_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"tags" jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_scope_uq" UNIQUE("family_id","record_id","id"),
	CONSTRAINT "document_revision_ck" CHECK ("documents"."current_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_family_id_record_id_document_id_documents_family_id_record_id_id_fk" FOREIGN KEY ("family_id","record_id","document_id") REFERENCES "public"."documents"("family_id","record_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_family_id_record_id_document_id_documents_family_id_record_id_id_fk" FOREIGN KEY ("family_id","record_id","document_id") REFERENCES "public"."documents"("family_id","record_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_family_id_record_id_records_family_id_id_fk" FOREIGN KEY ("family_id","record_id") REFERENCES "public"."records"("family_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_status_idx" ON "document_versions" USING btree ("status","updated_at");