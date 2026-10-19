import { and, eq, desc, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import * as s from "../db/schema";
import { member, type Actor } from "./service";
import { AppError } from "../lib/errors";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0,10) === v;
});
export const activityInput = z.object({
  group: z.enum(["all", "record", "asset", "liability", "document", "reminder", "member", "family", "notifications", "records"]).default("all"),
  from: date.optional(), to: date.optional(),
  cursor: z.object({time: z.string().datetime(), id: z.string().uuid()}).strict().optional(),
  limit: z.number().int().min(1).max(50).default(25),
}).strict().refine(x => !x.from || !x.to || x.from <= x.to, {message:"Invalid date range"});
export async function activityHistory(db: Db, familyId: string, actor: Actor, raw: unknown) {
  const input = activityInput.parse(raw);
  return db.transaction(async q => {
    const m = await member(q, familyId, actor);
    if (!["owner", "administrator"].includes(m.role)) throw new AppError("FORBIDDEN",403);
    // Administrators/owners normally view all records, but explicit view-denies win.
    // Filter BEFORE pagination: hidden record events never leak through counts/cursors.
    const visible = sql`(${s.auditLogs.recordId} is null or (
      ${s.records.id} is not null and not exists (
        select 1 from ${s.recordGrants} g
        where g.family_id = ${familyId} and g.record_id = ${s.auditLogs.recordId}
        and g.membership_id = ${m.id} and g.action = 'view' and g.effect = 'deny'
      )))`;
    const from = input.from ? new Date(input.from + "T00:00:00+06:00") : undefined;
    const to = input.to ? new Date(new Date(input.to + "T00:00:00+06:00").getTime() + 86400000) : undefined;
    const rows = await q.select({
      id:s.auditLogs.id, action:s.auditLogs.action,
      // Keep microseconds in the cursor, not a JS Date rounded to milliseconds.
      time:sql<string>`to_char(${s.auditLogs.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      actorName:s.user.name, recordId:s.auditLogs.recordId, recordName:s.records.name,
    }).from(s.auditLogs)
      .leftJoin(s.records, and(eq(s.records.id,s.auditLogs.recordId),eq(s.records.familyId,familyId)))
      .leftJoin(s.user,eq(s.user.id,s.auditLogs.actorId))
      .where(and(eq(s.auditLogs.familyId,familyId), visible,
        input.group !== "all" ? sql`${s.auditLogs.action} like ${input.group + '.%'}` : undefined,
        from ? gte(s.auditLogs.createdAt,from) : undefined,
        to ? lt(s.auditLogs.createdAt,to) : undefined,
        input.cursor ? sql`(${s.auditLogs.createdAt}, ${s.auditLogs.id}) < (${input.cursor.time}::timestamptz, ${input.cursor.id}::uuid)` : undefined,
      )).orderBy(desc(s.auditLogs.createdAt),desc(s.auditLogs.id)).limit(input.limit+1);
    const entries=rows.slice(0,input.limit), last=entries.at(-1);
    return {entries,nextCursor:rows.length>input.limit && last ? {time:last.time,id:last.id} : null};
  }, {isolationLevel:"repeatable read"});
}
