CREATE TABLE "liability_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"principal" numeric(24, 2) NOT NULL,
	"interest" numeric(24, 2) NOT NULL,
	"fees" numeric(24, 2) NOT NULL,
	"balance_before" numeric(24, 2) NOT NULL,
	"balance_after" numeric(24, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amounts_ck" CHECK ("liability_payments"."principal" >= 0 and "liability_payments"."interest" >= 0 and "liability_payments"."fees" >= 0 and "liability_payments"."principal" < 'Infinity'::numeric and "liability_payments"."interest" < 'Infinity'::numeric and "liability_payments"."fees" < 'Infinity'::numeric and "liability_payments"."principal" + "liability_payments"."interest" + "liability_payments"."fees" > 0),
	CONSTRAINT "payment_balance_ck" CHECK ("liability_payments"."balance_after" >= 0 and "liability_payments"."balance_before" < 'Infinity'::numeric and "liability_payments"."balance_after" = "liability_payments"."balance_before" - "liability_payments"."principal")
);
--> statement-breakpoint
ALTER TABLE "liability_payments" ADD CONSTRAINT "liability_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liability_payments" ADD CONSTRAINT "liability_payments_family_id_record_id_records_family_id_id_fk" FOREIGN KEY ("family_id","record_id") REFERENCES "public"."records"("family_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_history_idx" ON "liability_payments" USING btree ("family_id","record_id","paid_on");