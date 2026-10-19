import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, eq, asc, getTableColumns } from "drizzle-orm";
import type { Db } from "../db";
import * as s from "../db/schema";
import { authorized, audit, type Actor } from "./service";
import { AppError } from "../lib/errors";
export const HISTORY_ROW_LIMIT = 1000;
export const HISTORY_BYTE_LIMIT = 4 * 1024 * 1024;
export async function exportRecordHistory(db: Db, familyId: string, actor: Actor, recordId: string) {
  return db.transaction(async q => {
    const {r} = await authorized(q,familyId,actor,recordId,"export");
    const [family] = await q.select({id:s.families.id,name:s.families.name}).from(s.families).where(eq(s.families.id,familyId));
    const [asset] = await q.select().from(s.assets).where(and(eq(s.assets.familyId,familyId),eq(s.assets.recordId,recordId)));
    const [liability] = await q.select().from(s.liabilities).where(and(eq(s.liabilities.familyId,familyId),eq(s.liabilities.recordId,recordId)));
    const [catalog] = await q.select().from(s.catalogTypes).where(eq(s.catalogTypes.code,r.typeCode));
    const scope = (table: {familyId: AnyPgColumn;recordId:AnyPgColumn}) => and(eq(table.familyId,familyId),eq(table.recordId,recordId));
    // Operational request hashes/keys are intentionally excluded from file metadata.
    const {requestKey: _requestKey,inputHash: _inputHash,...versionFields}=getTableColumns(s.documentVersions);
    const collections = {
      valuations: await q.select().from(s.valuations).where(scope(s.valuations)).orderBy(asc(s.valuations.createdAt),asc(s.valuations.id)).limit(HISTORY_ROW_LIMIT+1),
      payments: await q.select().from(s.liabilityPayments).where(scope(s.liabilityPayments)).orderBy(asc(s.liabilityPayments.createdAt),asc(s.liabilityPayments.id)).limit(HISTORY_ROW_LIMIT+1),
      paymentReversals: await q.select().from(s.paymentReversals).where(scope(s.paymentReversals)).orderBy(asc(s.paymentReversals.createdAt),asc(s.paymentReversals.id)).limit(HISTORY_ROW_LIMIT+1),
      detailHistory: await q.select().from(s.detailHistory).where(scope(s.detailHistory)).orderBy(asc(s.detailHistory.recordVersion)).limit(HISTORY_ROW_LIMIT+1),
      ownershipHistory: await q.select().from(s.ownershipHistory).where(scope(s.ownershipHistory)).orderBy(asc(s.ownershipHistory.recordVersion)).limit(HISTORY_ROW_LIMIT+1),
      reminders: await q.select().from(s.reminders).where(scope(s.reminders)).orderBy(asc(s.reminders.createdAt),asc(s.reminders.id)).limit(HISTORY_ROW_LIMIT+1),
      reminderEvents: await q.select().from(s.reminderEvents).where(scope(s.reminderEvents)).orderBy(asc(s.reminderEvents.recordVersion)).limit(HISTORY_ROW_LIMIT+1),
      documents: await q.select().from(s.documents).where(scope(s.documents)).orderBy(asc(s.documents.createdAt),asc(s.documents.id)).limit(HISTORY_ROW_LIMIT+1),
      documentVersions: await q.select(versionFields).from(s.documentVersions).where(scope(s.documentVersions)).orderBy(asc(s.documentVersions.createdAt),asc(s.documentVersions.id)).limit(HISTORY_ROW_LIMIT+1),
      documentEvents: await q.select().from(s.documentEvents).where(scope(s.documentEvents)).orderBy(asc(s.documentEvents.createdAt),asc(s.documentEvents.id)).limit(HISTORY_ROW_LIMIT+1),
    };
    if(Object.values(collections).some(rows=>rows.length>HISTORY_ROW_LIMIT))throw new AppError("HISTORY_EXPORT_LIMIT",413);
    const archive = {
      format:"monethakbe-record-history",formatVersion:1,exportedAt:new Date().toISOString(),currency:"BDT",family,
      scope:"One currently view/export-authorized record and its stored history. Not a full workspace backup or restore package.",
      exclusions:["document file bytes","memberships and access grants","authentication and email data","workspace audit log","complete before/after history of basic record fields"],
      record:r,asset:asset??null,liability:liability??null,catalog,
      counts:Object.fromEntries(Object.entries(collections).map(([key,rows])=>[key,rows.length])),
      ...collections,
    };
    const json=JSON.stringify(archive,null,2);
    if(Buffer.byteLength(json,"utf8")>HISTORY_BYTE_LIMIT)throw new AppError("HISTORY_EXPORT_LIMIT",413);
    await audit(q,familyId,actor,"record.history.exported",recordId);
    return json;
  },{isolationLevel:"repeatable read"});
}
export async function historyExportResponse(db: Db,familyId:string,actor:Actor,recordId:string) {
  const json=await exportRecordHistory(db,familyId,actor,recordId);
  return new Response(json,{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="monethakbe-history-${recordId}.json"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
