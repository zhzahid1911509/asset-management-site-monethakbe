import type { OwnerEntry } from "../lib/ownership";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  date,
  bigint,
  boolean,
  uuid,
  integer,
  numeric,
  jsonb,
  unique,
  index,
  foreignKey,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: time("created_at").defaultNow().notNull(),
  updatedAt: time("updated_at").defaultNow().notNull(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    unique("provider_account_uq").on(t.providerId, t.accountId),
  ],
);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: time("created_at").defaultNow().notNull(),
  updatedAt: time("updated_at").defaultNow().notNull(),
});
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const families = pgTable("families", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").defaultNow().notNull(),
});
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull(),
    active: boolean("active").default(true).notNull(),
    expiresAt: time("expires_at"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("family_user_uq").on(t.familyId, t.userId),
    unique("family_membership_uq").on(t.familyId, t.id),
    check(
      "membership_role_ck",
      sql`${t.role} in ('owner','administrator','asset-manager','member','read-only','adviser')`,
    ),
  ],
);
export const catalogTypes = pgTable(
  "catalog_types",
  {
    code: text("code").primaryKey(),
    categoryCode: text("category_code").notNull(),
    kind: text("kind").notNull(),
    nameEn: text("name_en").notNull(),
    nameBn: text("name_bn").notNull(),
    categoryEn: text("category_en").notNull(),
    categoryBn: text("category_bn").notNull(),
    seedVersion: integer("seed_version").notNull(),
  },
  (t) => [check("catalog_kind_ck", sql`${t.kind} in ('asset','liability')`)],
);
export const records = pgTable(
  "records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    kind: text("kind").notNull(),
    typeCode: text("type_code")
      .notNull()
      .references(() => catalogTypes.code),
    name: text("name").notNull(),
    notes: text("notes").default("").notNull(),
    details: jsonb("details")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    archived: boolean("archived").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("family_record_uq").on(t.familyId, t.id),
    index("family_record_idx").on(t.familyId, t.archived, t.updatedAt),
    check("record_kind_ck", sql`${t.kind} in ('asset','liability')`),
    check("record_version_ck", sql`${t.version} > 0`),
  ],
);
export const assets = pgTable(
  "assets",
  {
    recordId: uuid("record_id").primaryKey(),
    familyId: uuid("family_id").notNull(),
    currency: text("currency").default("BDT").notNull(),
    ownershipPercent: numeric("ownership_percent", {
      precision: 9,
      scale: 6,
    }).notNull(),
    acquiredOn: date("acquired_on"),
    owners: jsonb("owners").$type<OwnerEntry[]>().default([]).notNull(),
    ownershipAsOf: date("ownership_as_of"),
    location: text("location").default("").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    check(
      "asset_share_ck",
      sql`${t.ownershipPercent} >= 0 and ${t.ownershipPercent} <= 100`,
    ),
    check("asset_currency_ck", sql`${t.currency} = 'BDT'`),
  ],
);
export const valuations = pgTable(
  "valuations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    amount: numeric("amount", { precision: 24, scale: 2 }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    index("valuation_latest_idx").on(
      t.familyId,
      t.recordId,
      t.asOf,
      t.createdAt,
    ),
    check(
      "value_positive_ck",
      sql`${t.amount} >= 0 and ${t.amount} < 'Infinity'::numeric`,
    ),
  ],
);
export const liabilities = pgTable(
  "liabilities",
  {
    recordId: uuid("record_id").primaryKey(),
    familyId: uuid("family_id").notNull(),
    outstanding: numeric("outstanding", { precision: 24, scale: 2 }).notNull(),
    currency: text("currency").default("BDT").notNull(),
    lender: text("lender").default("").notNull(),
    balanceAsOf: date("balance_as_of").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    check(
      "balance_positive_ck",
      sql`${t.outstanding} >= 0 and ${t.outstanding} < 'Infinity'::numeric`,
    ),
    check("liability_currency_ck", sql`${t.currency} = 'BDT'`),
  ],
);
export const recordGrants = pgTable(
  "record_grants",
  {
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    action: text("action").notNull(),
    effect: text("effect").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.membershipId, t.action] }),
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    foreignKey({
      columns: [t.familyId, t.membershipId],
      foreignColumns: [memberships.familyId, memberships.id],
    }),
    check("grant_action_ck", sql`${t.action} in ('view','edit','export')`),
    check("grant_effect_ck", sql`${t.effect} in ('allow','deny')`),
  ],
);
export const invitations = pgTable("invitations", {
  reactivationMembershipId: uuid("reactivation_membership_id"),
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: time("expires_at").notNull(),
  acceptedAt: time("accepted_at"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").defaultNow().notNull(),
});
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  recordId: uuid("record_id"),
  createdAt: time("created_at").defaultNow().notNull(),
});
export const operations = pgTable(
  "operations",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    key: uuid("key").notNull(),
    hash: text("hash").notNull(),
    result: jsonb("result").$type<{ id: string }>().notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.actorId, t.key] })],
);
export const preferences = pgTable(
  "preferences",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    locale: text("locale").default("bn").notNull(),
    mode: text("mode").default("simple").notNull(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.userId] })],
);
export const emailJobs = pgTable(
  "email_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payload: text("payload").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: time("available_at").defaultNow().notNull(),
    leaseToken: uuid("lease_token"),
    leaseUntil: time("lease_until"),
    lastError: text("last_error"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [index("email_due_idx").on(t.status, t.availableAt)],
);

export const liabilityPayments = pgTable(
  "liability_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    principal: numeric("principal", { precision: 24, scale: 2 }).notNull(),
    interest: numeric("interest", { precision: 24, scale: 2 }).notNull(),
    fees: numeric("fees", { precision: 24, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", {
      precision: 24,
      scale: 2,
    }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 24,
      scale: 2,
    }).notNull(),
    paidOn: date("paid_on").notNull(),
    note: text("note").default("").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    index("payment_history_idx").on(t.familyId, t.recordId, t.paidOn),
    unique("payment_family_record_uq").on(t.familyId, t.recordId, t.id),
    check(
      "payment_amounts_ck",
      sql`${t.principal} >= 0 and ${t.interest} >= 0 and ${t.fees} >= 0 and ${t.principal} < 'Infinity'::numeric and ${t.interest} < 'Infinity'::numeric and ${t.fees} < 'Infinity'::numeric and ${t.principal} + ${t.interest} + ${t.fees} > 0`,
    ),
    check(
      "payment_balance_ck",
      sql`${t.balanceAfter} >= 0 and ${t.balanceBefore} < 'Infinity'::numeric and ${t.balanceAfter} = ${t.balanceBefore} - ${t.principal}`,
    ),
  ],
);

export const detailHistory = pgTable(
  "record_detail_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    recordVersion: integer("record_version").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    details: jsonb("details").$type<Record<string, string>>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    unique("detail_revision_uq").on(t.familyId, t.recordId, t.recordVersion),
    check("detail_object_ck", sql`jsonb_typeof(${t.details}) = 'object'`),
    check(
      "detail_revision_ck",
      sql`${t.recordVersion} > 0 and ${t.schemaVersion} = 1`,
    ),
  ],
);
export const ownershipHistory = pgTable(
  "ownership_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    recordVersion: integer("record_version").notNull(),
    familyShare: numeric("family_share", { precision: 9, scale: 6 }).notNull(),
    owners: jsonb("owners").$type<OwnerEntry[]>().notNull(),
    asOf: date("as_of"),
    reason: text("reason").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    unique("ownership_revision_uq").on(t.familyId, t.recordId, t.recordVersion),
    check(
      "ownership_share_ck",
      sql`${t.familyShare} >= 0 and ${t.familyShare} <= 100`,
    ),
    check(
      "ownership_owners_ck",
      sql`jsonb_typeof(${t.owners}) = 'array' and jsonb_array_length(${t.owners}) <= 20`,
    ),
    check("ownership_revision_ck", sql`${t.recordVersion} > 0`),
  ],
);

export const paymentReversals = pgTable(
  "payment_reversals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    paymentId: uuid("payment_id").notNull().unique(),
    principal: numeric("principal", { precision: 24, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", {
      precision: 24,
      scale: 2,
    }).notNull(),
    balanceAfter: numeric("balance_after", {
      precision: 24,
      scale: 2,
    }).notNull(),
    reversedOn: date("reversed_on").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId, t.paymentId],
      foreignColumns: [
        liabilityPayments.familyId,
        liabilityPayments.recordId,
        liabilityPayments.id,
      ],
    }),
    check(
      "reversal_balance_ck",
      sql`${t.principal} >= 0 and ${t.balanceBefore} >= 0 and ${t.balanceAfter} < 'Infinity'::numeric and ${t.balanceAfter} = ${t.balanceBefore} + ${t.principal}`,
    ),
  ],
);
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    dueOn: date("due_on").notNull(),
    recurrence: text("recurrence").notNull(),
    anchorDay: integer("anchor_day").notNull(),
    note: text("note").default("").notNull(),
    status: text("status").default("active").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    unique("reminder_family_record_uq").on(t.familyId, t.recordId, t.id),
    index("reminder_due_idx").on(t.familyId, t.status, t.dueOn),
    check("reminder_anchor_ck", sql`${t.anchorDay} between 1 and 31`),
    check(
      "reminder_status_ck",
      sql`${t.status} in ('active','completed','cancelled')`,
    ),
    check(
      "reminder_category_ck",
      sql`${t.category} in ('maturity','renewal','payment','maintenance','valuation','family-task','other')`,
    ),
    check(
      "reminder_recurrence_ck",
      sql`${t.recurrence} in ('none','daily','weekly','monthly','quarterly','yearly')`,
    ),
  ],
);
export const reminderEvents = pgTable(
  "reminder_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    reminderId: uuid("reminder_id").notNull(),
    recordVersion: integer("record_version").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot")
      .$type<{
        title: string;
        category: string;
        dueOn: string;
        recurrence: string;
        anchorDay: number;
        note: string;
        status: string;
      }>()
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId, t.reminderId],
      foreignColumns: [reminders.familyId, reminders.recordId, reminders.id],
    }),
    unique("reminder_event_version_uq").on(
      t.familyId,
      t.recordId,
      t.recordVersion,
    ),
    check(
      "reminder_event_action_ck",
      sql`${t.action} in ('created','updated','complete','cancel','reopen')`,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    archived: boolean("archived").default(false).notNull(),
    currentRevision: integer("current_revision").default(0).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("document_scope_uq").on(t.familyId, t.recordId, t.id),
    foreignKey({
      columns: [t.familyId, t.recordId],
      foreignColumns: [records.familyId, records.id],
    }),
    check("document_revision_ck", sql`${t.currentRevision} >= 0`),
  ],
);
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    documentId: uuid("document_id").notNull(),
    revision: integer("revision").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").default("pending").notNull(),
    errorCode: text("error_code"),
    requestKey: uuid("request_key").notNull(),
    inputHash: text("input_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
    scannedAt: time("scanned_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId, t.documentId],
      foreignColumns: [documents.familyId, documents.recordId, documents.id],
    }),
    unique("document_revision_uq").on(t.documentId, t.revision),
    unique("document_request_uq").on(t.familyId, t.createdBy, t.requestKey),
    index("document_status_idx").on(t.status, t.updatedAt),
    check("document_size_ck", sql`${t.size} > 0 and ${t.size} <= 10485760`),
    check(
      "document_status_ck",
      sql`${t.status} in ('pending','scanning','available','rejected','failed','discarded')`,
    ),
    check(
      "document_clean_ck",
      sql`${t.status} <> 'available' or ${t.scannedAt} is not null`,
    ),
  ],
);
export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    documentId: uuid("document_id").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.familyId, t.recordId, t.documentId],
      foreignColumns: [documents.familyId, documents.recordId, documents.id],
    }),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    userId: text("user_id").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    categories: jsonb("categories").$type<string[]>().notNull(),
    advanceDays: jsonb("advance_days").$type<number[]>().notNull(),
    timeZone: text("time_zone").notNull(),
    sendAt: text("send_at").notNull(),
    quietEnabled: boolean("quiet_enabled").notNull(),
    quietStart: text("quiet_start").notNull(),
    quietEnd: text("quiet_end").notNull(),
    version: integer("version").default(1).notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("notification_preference_user_uq").on(t.familyId, t.userId),
    foreignKey({
      columns: [t.familyId, t.userId],
      foreignColumns: [memberships.familyId, memberships.userId],
    }),
    check("notification_preference_version_ck", sql`${t.version}>0`),
  ],
);
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id").notNull(),
    recordId: uuid("record_id").notNull(),
    reminderId: uuid("reminder_id").notNull(),
    userId: text("user_id").notNull(),
    dueOn: date("due_on").notNull(),
    advanceDays: integer("advance_days").notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    jobId: uuid("job_id")
      .unique()
      .references(() => emailJobs.id),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("notification_occurrence_uq").on(
      t.familyId,
      t.userId,
      t.reminderId,
      t.dueOn,
      t.advanceDays,
    ),
    foreignKey({
      columns: [t.familyId, t.recordId, t.reminderId],
      foreignColumns: [reminders.familyId, reminders.recordId, reminders.id],
    }),
    foreignKey({
      columns: [t.familyId, t.userId],
      foreignColumns: [memberships.familyId, memberships.userId],
    }),
    check("notification_advance_ck", sql`${t.advanceDays} between 0 and 30`),
  ],
);
