import { and, eq, desc, sql } from "drizzle-orm";
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
async function member(q: Query, familyId: string, a: Actor) {
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
async function authorized(
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
const audit = (
  q: Query,
  familyId: string,
  a: Actor,
  action: string,
  recordId?: string,
) =>
  q.insert(s.auditLogs).values({ familyId, actorId: a.id, action, recordId });
async function mutate(
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
    const [r] = await q
      .insert(s.records)
      .values({
        familyId,
        kind: data.kind,
        typeCode: data.typeCode,
        name: data.name,
        notes: data.notes,
        createdBy: a.id,
      })
      .returning();
    if (data.kind === "asset") {
      await q
        .insert(s.assets)
        .values({
          familyId,
          recordId: r.id,
          ownershipPercent: data.ownershipPercent,
          location: data.location,
        });
      if (data.amount !== undefined)
        await q
          .insert(s.valuations)
          .values({
            familyId,
            recordId: r.id,
            amount: data.amount,
            asOf: data.asOf,
            source: data.source,
            createdBy: a.id,
          });
    } else
      await q
        .insert(s.liabilities)
        .values({
          familyId,
          recordId: r.id,
          outstanding: data.amount!,
          lender: data.lender,
          balanceAsOf: data.asOf,
        });
    await q
      .insert(s.recordGrants)
      .values(
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
      await q
        .insert(s.valuations)
        .values({
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
    await q
      .insert(s.emailJobs)
      .values({
        payload: seal(
          JSON.stringify({
            to: data.email,
            subject: "Invitation to মনে থাকবে",
            text: `You have been invited to a family workspace. Sign in with ${data.email}, then open this link within 48 hours: ${url.toString()}`,
          }),
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
    await q
      .insert(s.memberships)
      .values({
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
  return db.transaction(async (q) => {
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
  });
}
