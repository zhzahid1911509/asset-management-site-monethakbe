import { emailTemplate } from "./email-templates";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db";
import * as s from "../db/schema";
import { can, canCreate, isActive, type Action } from "../lib/policy";
import { AppError } from "../lib/errors";
import {
  recordInput,
  patchInput,
  valuationInput,
  uuid,
  role,
} from "../lib/validation";
import Decimal from "decimal.js";
import { parseDetails } from "../lib/record-details";
import { ownershipInput } from "../lib/ownership";
import {
  reminderInput,
  reminderActionInput,
  nextDueDate,
  type Recurrence,
} from "../lib/reminders";
import { reversalInput } from "../lib/validation";
import { paymentInput } from "../lib/validation";
import { totals } from "../lib/money";
import { seal } from "./secrets";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Query = Db | Tx;
export type Actor = { id: string; email: string };
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function member(q: Query, familyId: string, a: Actor) {
  uuid.parse(familyId);
  const [m] = await q
    .select()
    .from(s.memberships)
    .where(
      and(eq(s.memberships.familyId, familyId), eq(s.memberships.userId, a.id)),
    )
    .for("share");
  if (!m || !isActive(m)) throw new AppError("NOT_FOUND", 404);
  return m;
}
export async function authorized(
  q: Query,
  familyId: string,
  a: Actor,
  id: string,
  action: Action,
) {
  const m = await member(q, familyId, a);
  uuid.parse(id);
  const [r] = await q
    .select()
    .from(s.records)
    .where(and(eq(s.records.familyId, familyId), eq(s.records.id, id)));
  if (!r) throw new AppError("NOT_FOUND", 404);
  const grants = await q
    .select()
    .from(s.recordGrants)
    .where(
      and(
        eq(s.recordGrants.familyId, familyId),
        eq(s.recordGrants.membershipId, m.id),
      ),
    );
  if (!can(m, r, action, grants)) throw new AppError("NOT_FOUND", 404);
  return { m, r };
}
export const audit = (
  q: Query,
  familyId: string,
  a: Actor,
  action: string,
  recordId?: string,
) =>
  q.insert(s.auditLogs).values({ familyId, actorId: a.id, action, recordId });
export async function mutate(
  db: Db,
  familyId: string,
  a: Actor,
  key: string,
  payload: unknown,
  run: (q: Tx) => Promise<{ id: string }>,
) {
  uuid.parse(key);
  return db.transaction(async (q) => {
    await member(q, familyId, a);
    await q.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${familyId + ":" + a.id + ":" + key},0))`,
    );
    const digest = hash(JSON.stringify(payload));
    const [old] = await q
      .select()
      .from(s.operations)
      .where(
        and(
          eq(s.operations.familyId, familyId),
          eq(s.operations.actorId, a.id),
          eq(s.operations.key, key),
        ),
      );
    if (old) {
      if (old.hash !== digest) throw new AppError("IDEMPOTENCY_CONFLICT", 409);
      await authorized(q, familyId, a, old.result.id, "edit");
      return old.result;
    }
    const result = await run(q);
    await q
      .insert(s.operations)
      .values({ familyId, actorId: a.id, key, hash: digest, result });
    return result;
  });
}
export async function listFamilies(db: Db, a: Actor) {
  const rows = await db
    .select({
      id: s.families.id,
      name: s.families.name,
      role: s.memberships.role,
      active: s.memberships.active,
      expiresAt: s.memberships.expiresAt,
      membershipId: s.memberships.id,
      userId: s.memberships.userId,
    })
    .from(s.memberships)
    .innerJoin(s.families, eq(s.families.id, s.memberships.familyId))
    .where(eq(s.memberships.userId, a.id));
  return rows
    .filter((r) => isActive({ ...r, id: r.membershipId }))
    .map(({ id, name, role }) => ({ id, name, role }));
}
export async function createFamily(db: Db, a: Actor, input: unknown) {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(80) })
    .parse(input);
  return db.transaction(async (q) => {
    const [f] = await q
      .insert(s.families)
      .values({ name, ownerId: a.id })
      .returning();
    await q
      .insert(s.memberships)
      .values({ familyId: f.id, userId: a.id, role: "owner" });
    await audit(q, f.id, a, "family.created");
    return f;
  });
}
async function readSnapshot(q: Query, familyId: string, a: Actor) {
  const m = await member(q, familyId, a);
  const rows = await q
    .select({
      record: s.records,
      asset: s.assets,
      liability: s.liabilities,
      type: s.catalogTypes,
    })
    .from(s.records)
    .innerJoin(s.catalogTypes, eq(s.records.typeCode, s.catalogTypes.code))
    .leftJoin(
      s.assets,
      and(eq(s.assets.recordId, s.records.id), eq(s.assets.familyId, familyId)),
    )
    .leftJoin(
      s.liabilities,
      and(
        eq(s.liabilities.recordId, s.records.id),
        eq(s.liabilities.familyId, familyId),
      ),
    )
    .where(eq(s.records.familyId, familyId))
    .orderBy(desc(s.records.updatedAt));
  const grants = await q
    .select()
    .from(s.recordGrants)
    .where(
      and(
        eq(s.recordGrants.familyId, familyId),
        eq(s.recordGrants.membershipId, m.id),
      ),
    );
  const values = await q
    .select()
    .from(s.valuations)
    .where(
      and(
        eq(s.valuations.familyId, familyId),
        sql`${s.valuations.asOf} <= ${today()}`,
      ),
    )
    .orderBy(
      desc(s.valuations.asOf),
      desc(s.valuations.createdAt),
      desc(s.valuations.id),
    );
  const latest = new Map<string, (typeof values)[number]>();
  for (const v of values)
    if (!latest.has(v.recordId)) latest.set(v.recordId, v);
  const visible = rows
    .filter((r) => can(m, r.record, "view", grants))
    .map(({ record: r, asset, liability, type }) => {
      const v = latest.get(r.id);
      return {
        ...r,
        typeNameEn: type.nameEn,
        typeNameBn: type.nameBn,
        categoryCode: type.categoryCode,
        categoryEn: type.categoryEn,
        categoryBn: type.categoryBn,
        amount:
          r.kind === "asset"
            ? (v?.amount ?? null)
            : (liability?.outstanding ?? null),
        ownershipPercent: asset?.ownershipPercent ?? "100",
        owners: asset?.owners ?? [],
        ownershipAsOf: asset?.ownershipAsOf ?? null,
        location: asset?.location ?? "",
        lender: liability?.lender ?? "",
        valuationDate:
          r.kind === "asset"
            ? (v?.asOf ?? null)
            : (liability?.balanceAsOf ?? null),
        valuationSource: v?.source ?? null,
        canEdit: can(m, r, "edit", grants),
        canExport: can(m, r, "export", grants),
      };
    });
  const [prefs] = await q
    .select()
    .from(s.preferences)
    .where(
      and(eq(s.preferences.familyId, familyId), eq(s.preferences.userId, a.id)),
    );
  const [family] = await q
    .select()
    .from(s.families)
    .where(eq(s.families.id, familyId));
  return {
    family: { id: family.id, name: family.name },
    membership: { id: m.id, role: m.role },
    records: visible,
    totals: totals(visible),
    preferences: prefs
      ? { locale: prefs.locale, mode: prefs.mode }
      : { locale: "bn", mode: "simple" },
    canCreate: canCreate(m),
  };
}
export async function snapshot(db: Db, familyId: string, a: Actor) {
  return db.transaction((q) => readSnapshot(q, familyId, a));
}
export async function createRecord(
  db: Db,
  familyId: string,
  a: Actor,
  input: unknown,
  key: string,
) {
  const data = recordInput.parse(input);
  if (data.asOf > today()) throw new AppError("FUTURE_VALUATION");
  return mutate(db, familyId, a, key, { action: "create", data }, async (q) => {
    const m = await member(q, familyId, a);
    if (!canCreate(m)) throw new AppError("FORBIDDEN", 403);
    const [type] = await q
      .select()
      .from(s.catalogTypes)
      .where(eq(s.catalogTypes.code, data.typeCode));
    if (!type || type.kind !== data.kind) throw new AppError("INVALID_TYPE");
    const details = parseDetails(type.categoryCode, data.details);
    const [r] = await q
      .insert(s.records)
      .values({
        familyId,
        kind: data.kind,
        typeCode: data.typeCode,
        name: data.name,
        notes: data.notes,
        details,
        createdBy: a.id,
      })
      .returning();
    if (data.kind === "asset") {
      await q.insert(s.assets).values({
        familyId,
        recordId: r.id,
        ownershipPercent: data.ownershipPercent,
        location: data.location,
      });
      if (data.amount !== undefined)
        await q.insert(s.valuations).values({
          familyId,
          recordId: r.id,
          amount: data.amount,
          asOf: data.asOf,
          source: data.source,
          createdBy: a.id,
        });
    } else
      await q.insert(s.liabilities).values({
        familyId,
        recordId: r.id,
        outstanding: data.amount!,
        lender: data.lender,
        balanceAsOf: data.asOf,
      });
    await q.insert(s.detailHistory).values({
      familyId,
      recordId: r.id,
      recordVersion: 1,
      details,
      createdBy: a.id,
    });
    if (data.kind === "asset")
      await q.insert(s.ownershipHistory).values({
        familyId,
        recordId: r.id,
        recordVersion: 1,
        familyShare: data.ownershipPercent,
        owners: [],
        reason: "Initial family share; effective date not specified",
        createdBy: a.id,
      });
    await q.insert(s.recordGrants).values(
      ["view", "edit"].map((action) => ({
        familyId,
        recordId: r.id,
        membershipId: m.id,
        action,
        effect: "allow",
      })),
    );
    await audit(q, familyId, a, "record.created", r.id);
    return { id: r.id };
  });
}
export async function editRecord(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = patchInput.parse(input);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "edit", id, data },
    async (q) => {
      await authorized(q, familyId, a, id, "edit");
      const [r] = await q
        .update(s.records)
        .set({
          name: data.name,
          notes: data.notes,
          updatedAt: new Date(),
          version: sql`${s.records.version}+1`,
        })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
          ),
        )
        .returning();
      if (!r) throw new AppError("CONFLICT", 409);
      await audit(q, familyId, a, "record.edited", id);
      return { id };
    },
  );
}
export async function archiveRecord(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = z
    .object({ archived: z.boolean(), version: z.number().int().positive() })
    .parse(input);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "archive", id, data },
    async (q) => {
      await authorized(q, familyId, a, id, "edit");
      const [r] = await q
        .update(s.records)
        .set({
          archived: data.archived,
          updatedAt: new Date(),
          version: sql`${s.records.version}+1`,
        })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
          ),
        )
        .returning();
      if (!r) throw new AppError("CONFLICT", 409);
      await audit(
        q,
        familyId,
        a,
        data.archived ? "record.archived" : "record.restored",
        id,
      );
      return { id };
    },
  );
}
export async function addValuation(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = valuationInput.parse(input);
  if (data.asOf > today()) throw new AppError("FUTURE_VALUATION");
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "valuation", id, data },
    async (q) => {
      const { r } = await authorized(q, familyId, a, id, "edit");
      if (r.kind !== "asset") throw new AppError("INVALID_TYPE");
      const [updated] = await q
        .update(s.records)
        .set({ version: sql`${s.records.version}+1`, updatedAt: new Date() })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
          ),
        )
        .returning();
      if (!updated) throw new AppError("CONFLICT", 409);
      await q.insert(s.valuations).values({
        familyId,
        recordId: id,
        amount: data.amount,
        asOf: data.asOf,
        source: data.source,
        createdBy: a.id,
      });
      await audit(q, familyId, a, "asset.valued", id);
      return { id };
    },
  );
}
export async function listMembers(db: Db, familyId: string, a: Actor) {
  return db.transaction(async (q) => {
    const m = await member(q, familyId, a);
    if (!["owner", "administrator"].includes(m.role))
      throw new AppError("FORBIDDEN", 403);
    return q
      .select({
        id: s.memberships.id,
        name: s.user.name,
        email: s.user.email,
        role: s.memberships.role,
        active: s.memberships.active,
        expiresAt: s.memberships.expiresAt,
      })
      .from(s.memberships)
      .innerJoin(s.user, eq(s.user.id, s.memberships.userId))
      .where(eq(s.memberships.familyId, familyId));
  });
}
export async function revokeMember(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
) {
  uuid.parse(id);
  return db.transaction(async (q) => {
    const m = await member(q, familyId, a);
    if (m.role !== "owner") throw new AppError("FORBIDDEN", 403);
    const [target] = await q
      .select()
      .from(s.memberships)
      .where(
        and(eq(s.memberships.familyId, familyId), eq(s.memberships.id, id)),
      )
      .for("update");
    if (!target || target.role === "owner" || target.userId === a.id)
      throw new AppError("FORBIDDEN", 403);
    await q
      .update(s.memberships)
      .set({ active: false })
      .where(eq(s.memberships.id, id));
    await audit(q, familyId, a, "member.revoked");
    return { ok: true };
  });
}
export async function setGrant(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
) {
  const data = z
    .object({
      membershipId: uuid,
      action: z.enum(["view", "edit", "export"]),
      effect: z.enum(["allow", "deny"]),
    })
    .parse(input);
  return db.transaction(async (q) => {
    const m = await member(q, familyId, a);
    if (m.role !== "owner") throw new AppError("FORBIDDEN", 403);
    await authorized(q, familyId, a, id, "view");
    const [target] = await q
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.id, data.membershipId),
          eq(s.memberships.familyId, familyId),
        ),
      )
      .for("update");
    if (!target || target.role === "owner")
      throw new AppError("FORBIDDEN", 403);
    await q
      .insert(s.recordGrants)
      .values({ familyId, recordId: id, ...data })
      .onConflictDoUpdate({
        target: [
          s.recordGrants.recordId,
          s.recordGrants.membershipId,
          s.recordGrants.action,
        ],
        set: { effect: data.effect },
      });
    await audit(q, familyId, a, "record.access.changed", id);
    return { ok: true };
  });
}
export async function inviteMember(
  db: Db,
  familyId: string,
  a: Actor,
  input: unknown,
) {
  const data = z
    .object({ email: z.string().email().max(254), role })
    .parse(input);
  const token = randomBytes(32).toString("base64url");
  return db.transaction(async (q) => {
    const m = await member(q, familyId, a);
    if (m.role !== "owner") throw new AppError("FORBIDDEN", 403);
    const [inv] = await q
      .insert(s.invitations)
      .values({
        familyId,
        email: data.email.toLowerCase(),
        role: data.role,
        tokenHash: hash(token),
        createdBy: a.id,
        expiresAt: new Date(Date.now() + 48 * 3600_000),
      })
      .returning();
    const url = new URL("/invite", process.env.APP_ORIGIN);
    url.searchParams.set("token", token);
    await q.insert(s.emailJobs).values({
      payload: seal(
        JSON.stringify(emailTemplate("invitation", url.toString(), data.email)),
        "email",
      ),
    });
    await audit(q, familyId, a, "member.invited");
    return { id: inv.id, status: "queued" };
  });
}
export async function acceptInvitation(db: Db, a: Actor, input: unknown) {
  const { token } = z
    .object({ token: z.string().min(32).max(200) })
    .parse(input);
  return db.transaction(async (q) => {
    const [inv] = await q
      .select()
      .from(s.invitations)
      .where(eq(s.invitations.tokenHash, hash(token)))
      .for("update");
    if (
      !inv ||
      inv.acceptedAt ||
      inv.expiresAt < new Date() ||
      inv.email !== a.email.toLowerCase()
    )
      throw new AppError("INVALID_INVITATION", 400);
    const [existing] = await q
      .select()
      .from(s.memberships)
      .where(
        and(
          eq(s.memberships.familyId, inv.familyId),
          eq(s.memberships.userId, a.id),
        ),
      );
    if (existing) throw new AppError("INVALID_INVITATION", 400);
    await q.insert(s.memberships).values({
      familyId: inv.familyId,
      userId: a.id,
      role: inv.role,
      expiresAt:
        inv.role === "adviser" ? new Date(Date.now() + 30 * 86400_000) : null,
    });
    await q
      .update(s.invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(s.invitations.id, inv.id));
    await audit(q, inv.familyId, a, "member.joined");
    return { id: inv.familyId };
  });
}
export async function savePreferences(
  db: Db,
  familyId: string,
  a: Actor,
  input: unknown,
) {
  const data = z
    .object({
      locale: z.enum(["bn", "en"]),
      mode: z.enum(["simple", "advanced"]),
    })
    .parse(input);
  return db.transaction(async (q) => {
    await member(q, familyId, a);
    await q
      .insert(s.preferences)
      .values({ familyId, userId: a.id, ...data })
      .onConflictDoUpdate({
        target: [s.preferences.familyId, s.preferences.userId],
        set: data,
      });
    return data;
  });
}
export async function exportRecords(db: Db, familyId: string, a: Actor) {
  return db.transaction(
    async (q) => {
      const m = await member(q, familyId, a);
      const all = await readSnapshot(q, familyId, a);
      const eligible = all.records.filter((r) => r.canExport);
      if (!eligible.length && !["owner", "administrator"].includes(m.role))
        throw new AppError("FORBIDDEN", 403);
      await audit(q, familyId, a, "records.exported");
      return {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        family: all.family,
        currency: "BDT",
        scope: "Records this user may view and export; current values only",
        records: eligible,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

export async function recordHistory(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
) {
  return db.transaction(async (q) => {
    const { r } = await authorized(q, familyId, a, id, "view");
    const valuations =
      r.kind === "asset"
        ? await q
            .select()
            .from(s.valuations)
            .where(
              and(
                eq(s.valuations.familyId, familyId),
                eq(s.valuations.recordId, id),
              ),
            )
            .orderBy(
              desc(s.valuations.asOf),
              desc(s.valuations.createdAt),
              desc(s.valuations.id),
            )
            .limit(101)
        : [];
    const payments =
      r.kind === "liability"
        ? await q
            .select({
              payment: s.liabilityPayments,
              reversal: s.paymentReversals,
            })
            .from(s.liabilityPayments)
            .leftJoin(
              s.paymentReversals,
              and(
                eq(s.paymentReversals.familyId, s.liabilityPayments.familyId),
                eq(s.paymentReversals.recordId, s.liabilityPayments.recordId),
                eq(s.paymentReversals.paymentId, s.liabilityPayments.id),
              ),
            )
            .where(
              and(
                eq(s.liabilityPayments.familyId, familyId),
                eq(s.liabilityPayments.recordId, id),
              ),
            )
            .orderBy(
              desc(s.liabilityPayments.paidOn),
              desc(s.liabilityPayments.createdAt),
              desc(s.liabilityPayments.id),
            )
            .limit(101)
        : [];
    return {
      valuations: valuations.slice(0, 100),
      payments: payments
        .slice(0, 100)
        .map(({ payment, reversal }) => ({ ...payment, reversal })),
      hasMore: valuations.length > 100 || payments.length > 100,
    };
  });
}
export async function addPayment(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = paymentInput.parse(input);
  if (data.paidOn > today()) throw new AppError("PAYMENT_DATE");
  if (new Decimal(data.principal).plus(data.interest).plus(data.fees).isZero())
    throw new AppError("EMPTY_PAYMENT");
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "payment", id, data },
    async (q) => {
      const { r } = await authorized(q, familyId, a, id, "edit");
      if (r.kind !== "liability") throw new AppError("INVALID_TYPE");
      // Lock/version the parent first, consistently with all other record mutations.
      const [updated] = await q
        .update(s.records)
        .set({ version: sql`${s.records.version}+1`, updatedAt: new Date() })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
            eq(s.records.archived, false),
          ),
        )
        .returning();
      if (!updated) throw new AppError("CONFLICT", 409);
      const [balance] = await q
        .select()
        .from(s.liabilities)
        .where(
          and(
            eq(s.liabilities.familyId, familyId),
            eq(s.liabilities.recordId, id),
          ),
        )
        .for("update");
      if (!balance) throw new AppError("INVALID_TYPE");
      if (data.paidOn < balance.balanceAsOf) throw new AppError("PAYMENT_DATE");
      const after = new Decimal(balance.outstanding).minus(data.principal);
      if (after.isNegative()) throw new AppError("OVERPAYMENT");
      await q.insert(s.liabilityPayments).values({
        familyId,
        recordId: id,
        principal: data.principal,
        interest: data.interest,
        fees: data.fees,
        paidOn: data.paidOn,
        note: data.note,
        balanceBefore: balance.outstanding,
        balanceAfter: after.toFixed(2),
        createdBy: a.id,
      });
      await q
        .update(s.liabilities)
        .set({ outstanding: after.toFixed(2), balanceAsOf: data.paidOn })
        .where(
          and(
            eq(s.liabilities.familyId, familyId),
            eq(s.liabilities.recordId, id),
          ),
        );
      await audit(q, familyId, a, "liability.payment.recorded", id);
      return { id };
    },
  );
}

export async function recordMetadata(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
) {
  return db.transaction(async (q) => {
    const { r } = await authorized(q, familyId, a, id, "view");
    const detailRows = await q
      .select()
      .from(s.detailHistory)
      .where(
        and(
          eq(s.detailHistory.familyId, familyId),
          eq(s.detailHistory.recordId, id),
        ),
      )
      .orderBy(desc(s.detailHistory.recordVersion))
      .limit(101);
    const ownershipRows =
      r.kind === "asset"
        ? await q
            .select()
            .from(s.ownershipHistory)
            .where(
              and(
                eq(s.ownershipHistory.familyId, familyId),
                eq(s.ownershipHistory.recordId, id),
              ),
            )
            .orderBy(desc(s.ownershipHistory.recordVersion))
            .limit(101)
        : [];
    return {
      detailHistory: detailRows.slice(0, 100),
      ownershipHistory: ownershipRows.slice(0, 100),
      hasMore: detailRows.length > 100 || ownershipRows.length > 100,
    };
  });
}
export async function saveDetails(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = z
    .strictObject({
      version: z.number().int().positive(),
      details: z.record(z.string(), z.string().max(250)),
    })
    .parse(input);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "details", id, data },
    async (q) => {
      const { r } = await authorized(q, familyId, a, id, "edit");
      const [type] = await q
        .select()
        .from(s.catalogTypes)
        .where(eq(s.catalogTypes.code, r.typeCode));
      const details = parseDetails(type.categoryCode, data.details);
      const [updated] = await q
        .update(s.records)
        .set({
          details,
          version: sql`${s.records.version}+1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
            eq(s.records.archived, false),
          ),
        )
        .returning();
      if (!updated) throw new AppError("CONFLICT", 409);
      await q.insert(s.detailHistory).values({
        familyId,
        recordId: id,
        recordVersion: updated.version,
        details,
        createdBy: a.id,
      });
      await audit(q, familyId, a, "record.details.updated", id);
      return { id };
    },
  );
}
export async function saveOwnership(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = ownershipInput.parse(input);
  if (data.asOf > today()) throw new AppError("OWNERSHIP_DATE");
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "ownership", id, data },
    async (q) => {
      const { r } = await authorized(q, familyId, a, id, "edit");
      if (r.kind !== "asset") throw new AppError("INVALID_TYPE");
      const [updated] = await q
        .update(s.records)
        .set({ version: sql`${s.records.version}+1`, updatedAt: new Date() })
        .where(
          and(
            eq(s.records.familyId, familyId),
            eq(s.records.id, id),
            eq(s.records.version, data.version),
            eq(s.records.archived, false),
          ),
        )
        .returning();
      if (!updated) throw new AppError("CONFLICT", 409);
      const [asset] = await q
        .select()
        .from(s.assets)
        .where(and(eq(s.assets.familyId, familyId), eq(s.assets.recordId, id)))
        .for("update");
      if (!asset) throw new AppError("INVALID_TYPE");
      if (asset.ownershipAsOf && data.asOf < asset.ownershipAsOf)
        throw new AppError("OWNERSHIP_DATE");
      await q
        .update(s.assets)
        .set({
          ownershipPercent: data.familyShare,
          owners: data.owners,
          ownershipAsOf: data.asOf,
        })
        .where(and(eq(s.assets.familyId, familyId), eq(s.assets.recordId, id)));
      await q.insert(s.ownershipHistory).values({
        familyId,
        recordId: id,
        recordVersion: updated.version,
        familyShare: data.familyShare,
        owners: data.owners,
        asOf: data.asOf,
        reason: data.reason,
        createdBy: a.id,
      });
      await audit(q, familyId, a, "asset.ownership.updated", id);
      return { id };
    },
  );
}

export async function bumpActiveRecord(
  q: Tx,
  familyId: string,
  id: string,
  version: number,
) {
  const [updated] = await q
    .update(s.records)
    .set({ version: sql`${s.records.version}+1`, updatedAt: new Date() })
    .where(
      and(
        eq(s.records.familyId, familyId),
        eq(s.records.id, id),
        eq(s.records.version, version),
        eq(s.records.archived, false),
      ),
    )
    .returning();
  if (!updated) throw new AppError("CONFLICT", 409);
  return updated;
}
export async function reversePayment(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = reversalInput.parse(input);
  if (data.reversedOn > today()) throw new AppError("REVERSAL_DATE");
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "reverse-payment", id, data },
    async (q) => {
      const { r } = await authorized(q, familyId, a, id, "edit");
      if (r.kind !== "liability") throw new AppError("INVALID_TYPE");
      await bumpActiveRecord(q, familyId, id, data.version);
      const [payment] = await q
        .select()
        .from(s.liabilityPayments)
        .where(
          and(
            eq(s.liabilityPayments.familyId, familyId),
            eq(s.liabilityPayments.recordId, id),
            eq(s.liabilityPayments.id, data.paymentId),
          ),
        );
      if (!payment) throw new AppError("NOT_FOUND", 404);
      const [old] = await q
        .select()
        .from(s.paymentReversals)
        .where(eq(s.paymentReversals.paymentId, data.paymentId));
      if (old) throw new AppError("ALREADY_REVERSED", 409);
      const [balance] = await q
        .select()
        .from(s.liabilities)
        .where(
          and(
            eq(s.liabilities.familyId, familyId),
            eq(s.liabilities.recordId, id),
          ),
        )
        .for("update");
      if (
        data.reversedOn < balance.balanceAsOf ||
        data.reversedOn < payment.paidOn
      )
        throw new AppError("REVERSAL_DATE");
      const after = new Decimal(balance.outstanding)
        .plus(payment.principal)
        .toFixed(2);
      await q.insert(s.paymentReversals).values({
        familyId,
        recordId: id,
        paymentId: payment.id,
        principal: payment.principal,
        balanceBefore: balance.outstanding,
        balanceAfter: after,
        reversedOn: data.reversedOn,
        reason: data.reason,
        createdBy: a.id,
      });
      await q
        .update(s.liabilities)
        .set({ outstanding: after, balanceAsOf: data.reversedOn })
        .where(
          and(
            eq(s.liabilities.familyId, familyId),
            eq(s.liabilities.recordId, id),
          ),
        );
      await audit(q, familyId, a, "liability.payment.reversed", id);
      return { id };
    },
  );
}
function reminderState(r: typeof s.reminders.$inferSelect) {
  return {
    title: r.title,
    category: r.category,
    dueOn: r.dueOn,
    recurrence: r.recurrence,
    anchorDay: r.anchorDay,
    note: r.note,
    status: r.status,
  };
}
export async function listReminders(db: Db, familyId: string, a: Actor) {
  return db.transaction(async (q) => {
    const m = await member(q, familyId, a);
    const grants = await q
      .select()
      .from(s.recordGrants)
      .where(
        and(
          eq(s.recordGrants.familyId, familyId),
          eq(s.recordGrants.membershipId, m.id),
        ),
      );
    const rows = await q
      .select({ reminder: s.reminders, record: s.records })
      .from(s.reminders)
      .innerJoin(
        s.records,
        and(
          eq(s.records.familyId, s.reminders.familyId),
          eq(s.records.id, s.reminders.recordId),
        ),
      )
      .where(eq(s.reminders.familyId, familyId))
      .orderBy(asc(s.reminders.dueOn), asc(s.reminders.id));
    const visible = rows.filter(({ record }) => can(m, record, "view", grants));
    return {
      today: today(),
      reminders: visible.map(({ reminder, record }) => ({
        ...reminder,
        recordName: record.name,
        recordVersion: record.version,
        archived: record.archived,
        canEdit: !record.archived && can(m, record, "edit", grants),
      })),
    };
  });
}
export async function saveReminder(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = reminderInput.parse(input);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "save-reminder", id, data },
    async (q) => {
      await authorized(q, familyId, a, id, "edit");
      const record = await bumpActiveRecord(q, familyId, id, data.version);
      const fields = {
        title: data.title,
        category: data.category,
        dueOn: data.dueOn,
        recurrence: data.recurrence,
        note: data.note,
        anchorDay: Number(data.dueOn.slice(8, 10)),
      };
      let reminder: typeof s.reminders.$inferSelect;
      if (data.reminderId) {
        const [old] = await q
          .select()
          .from(s.reminders)
          .where(
            and(
              eq(s.reminders.familyId, familyId),
              eq(s.reminders.recordId, id),
              eq(s.reminders.id, data.reminderId),
            ),
          );
        if (!old) throw new AppError("NOT_FOUND", 404);
        if (old.status !== "active") throw new AppError("REMINDER_CLOSED", 409);
        // Editing title/notes alone preserves the original month-end anchor.
        if (old.dueOn === data.dueOn && old.recurrence === data.recurrence)
          fields.anchorDay = old.anchorDay;
        [reminder] = await q
          .update(s.reminders)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(s.reminders.id, old.id))
          .returning();
      } else {
        [reminder] = await q
          .insert(s.reminders)
          .values({ familyId, recordId: id, ...fields, createdBy: a.id })
          .returning();
      }
      await q.insert(s.reminderEvents).values({
        familyId,
        recordId: id,
        reminderId: reminder.id,
        recordVersion: record.version,
        action: data.reminderId ? "updated" : "created",
        snapshot: reminderState(reminder),
        createdBy: a.id,
      });
      await audit(
        q,
        familyId,
        a,
        data.reminderId ? "reminder.updated" : "reminder.created",
        id,
      );
      return { id };
    },
  );
}
export async function changeReminder(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  input: unknown,
  key: string,
) {
  const data = reminderActionInput.parse(input);
  return mutate(
    db,
    familyId,
    a,
    key,
    { action: "change-reminder", id, data },
    async (q) => {
      await authorized(q, familyId, a, id, "edit");
      const record = await bumpActiveRecord(q, familyId, id, data.version);
      const [reminder] = await q
        .select()
        .from(s.reminders)
        .where(
          and(
            eq(s.reminders.familyId, familyId),
            eq(s.reminders.recordId, id),
            eq(s.reminders.id, data.reminderId),
          ),
        );
      if (!reminder) throw new AppError("NOT_FOUND", 404);
      if (
        (data.action === "reopen" && reminder.status === "active") ||
        (data.action !== "reopen" && reminder.status !== "active")
      )
        throw new AppError("REMINDER_CLOSED", 409);
      let status = reminder.status,
        dueOn = reminder.dueOn;
      if (data.action === "complete") {
        const next = nextDueDate(
          dueOn,
          reminder.recurrence as Recurrence,
          reminder.anchorDay,
        );
        if (next) dueOn = next;
        else status = "completed";
      } else status = data.action === "cancel" ? "cancelled" : "active";
      await q
        .update(s.reminders)
        .set({ status, dueOn, updatedAt: new Date() })
        .where(eq(s.reminders.id, reminder.id));
      // For actions, snapshot the occurrence being acted on (before advancing recurrence).
      await q.insert(s.reminderEvents).values({
        familyId,
        recordId: id,
        reminderId: reminder.id,
        recordVersion: record.version,
        action: data.action,
        snapshot: reminderState(reminder),
        createdBy: a.id,
      });
      await audit(q, familyId, a, `reminder.${data.action}`, id);
      return { id };
    },
  );
}
export async function reminderHistory(
  db: Db,
  familyId: string,
  a: Actor,
  id: string,
  reminderId: string,
) {
  uuid.parse(reminderId);
  return db.transaction(async (q) => {
    await authorized(q, familyId, a, id, "view");
    const [reminder] = await q
      .select()
      .from(s.reminders)
      .where(
        and(
          eq(s.reminders.familyId, familyId),
          eq(s.reminders.recordId, id),
          eq(s.reminders.id, reminderId),
        ),
      );
    if (!reminder) throw new AppError("NOT_FOUND", 404);
    const events = await q
      .select()
      .from(s.reminderEvents)
      .where(
        and(
          eq(s.reminderEvents.familyId, familyId),
          eq(s.reminderEvents.recordId, id),
          eq(s.reminderEvents.reminderId, reminderId),
        ),
      )
      .orderBy(desc(s.reminderEvents.recordVersion))
      .limit(101);
    return { events: events.slice(0, 100), hasMore: events.length > 100 };
  });
}
