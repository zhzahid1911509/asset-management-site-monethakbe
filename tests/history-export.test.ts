import {beforeAll,afterAll,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {testDatabase} from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import {exportRecordHistory,historyExportResponse} from "../src/server/history-export";
let f:Awaited<ReturnType<typeof testDatabase>>,familyId:string,assetId:string,loanId:string,memberId:string;
const owner={id:"history-owner",email:"owner@example.test"},reader={id:"history-reader",email:"reader@example.test"},outsider={id:"history-outsider",email:"outsider@example.test"};
beforeAll(async()=>{
 f=await testDatabase();await f.db.insert(s.user).values([owner,reader,outsider].map(a=>({...a,name:a.id,emailVerified:true})));
 familyId=(await service.createFamily(f.db,owner,{name:"History family"})).id;
 memberId=(await f.db.insert(s.memberships).values({familyId,userId:reader.id,role:"read-only"}).returning())[0].id;
 assetId=(await service.createRecord(f.db,familyId,owner,{kind:"asset",typeCode:"property.apartment",name:"Home",amount:"1234.56",ownershipPercent:"33.333333",asOf:"2026-01-01"},randomUUID())).id;
 loanId=(await service.createRecord(f.db,familyId,owner,{kind:"liability",typeCode:"liabilities.home",name:"Loan",amount:"1000.00",asOf:"2026-01-01"},randomUUID())).id;
});
afterAll(async()=>{await f.client.close();});
it("exports exact decimal values and existing history",async()=>{
 const data=JSON.parse(await exportRecordHistory(f.db,familyId,owner,assetId));
 expect(data.asset.ownershipPercent).toBe("33.333333");expect(data.valuations[0].amount).toBe("1234.56");expect(data.family.id).toBe(familyId);expect(data.record.id).toBe(assetId);expect(data.liability).toBeNull();
 expect(data.exclusions).toContain("document file bytes");
});
it("rejects view-only grants and outsiders, permits explicit export",async()=>{
 await f.db.insert(s.recordGrants).values({familyId,recordId:assetId,membershipId:memberId,action:"view",effect:"allow"});
 await expect(exportRecordHistory(f.db,familyId,reader,assetId)).rejects.toMatchObject({code:"NOT_FOUND"});
 await expect(exportRecordHistory(f.db,familyId,outsider,assetId)).rejects.toMatchObject({code:"NOT_FOUND"});
 await f.db.insert(s.recordGrants).values({familyId,recordId:assetId,membershipId:memberId,action:"export",effect:"allow"});
 expect(JSON.parse(await exportRecordHistory(f.db,familyId,reader,assetId)).record.id).toBe(assetId);
 await f.db.update(s.recordGrants).set({effect:"deny"}).where(and(eq(s.recordGrants.membershipId,memberId),eq(s.recordGrants.action,"view")));
 await expect(exportRecordHistory(f.db,familyId,reader,assetId)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("includes more than 100 revisions without leaking other record history",async()=>{
 await f.db.insert(s.detailHistory).values(Array.from({length:110},(_,i)=>({familyId,recordId:assetId,recordVersion:i+500,details:{note:`revision-${i}`},createdBy:owner.id})));
 const data=JSON.parse(await exportRecordHistory(f.db,familyId,owner,assetId));expect(data.detailHistory.length).toBeGreaterThanOrEqual(110);expect(data.detailHistory.every((r:{recordId:string})=>r.recordId===assetId)).toBe(true);expect(data.payments).toEqual([]);
});
it("includes document metadata but excludes operational upload keys",async()=>{
 const [d]=await f.db.insert(s.documents).values({familyId,recordId:assetId,title:"Test",description:"",category:"other",tags:[],createdBy:owner.id}).returning();
 await f.db.insert(s.documentVersions).values({familyId,recordId:assetId,documentId:d.id,revision:1,filename:"test.txt",mime:"text/plain",size:4,sha256:"a".repeat(64),status:"available",scannedAt:new Date(),requestKey:randomUUID(),inputHash:"private-hash",createdBy:owner.id});
 const data=JSON.parse(await exportRecordHistory(f.db,familyId,owner,assetId));expect(data.documentVersions[0].filename).toBe("test.txt");expect(data.documentVersions[0]).not.toHaveProperty("requestKey");expect(data.documentVersions[0]).not.toHaveProperty("inputHash");expect(data).not.toHaveProperty("emailJobs");
});
it("allows archived records and returns safe attachment headers",async()=>{
 await f.db.update(s.records).set({archived:true}).where(eq(s.records.id,assetId));
 const response=await historyExportResponse(f.db,familyId,owner,assetId);
 expect(response.headers.get("Cache-Control")).toBe("no-store");expect(response.headers.get("Content-Disposition")).toContain(assetId);expect((await response.json()).record.archived).toBe(true);
});
it("includes both payment and reversal ledgers with exact decimals",async()=>{
 const [payment]=await f.db.insert(s.liabilityPayments).values({familyId,recordId:loanId,principal:"100.10",interest:"3.20",fees:"1.00",balanceBefore:"1000.00",balanceAfter:"899.90",paidOn:"2026-01-02",createdBy:owner.id}).returning();
 await f.db.insert(s.paymentReversals).values({familyId,recordId:loanId,paymentId:payment.id,principal:"100.10",balanceBefore:"899.90",balanceAfter:"1000.00",reversedOn:"2026-01-03",reason:"Correction",createdBy:owner.id});
 const data=JSON.parse(await exportRecordHistory(f.db,familyId,owner,loanId));expect(data.payments[0].principal).toBe("100.10");expect(data.paymentReversals[0].paymentId).toBe(payment.id);expect(data.valuations).toEqual([]);
});
it("rejects oversized JSON instead of returning partial data",async()=>{
 const [row]=await f.db.insert(s.detailHistory).values({familyId,recordId:assetId,recordVersion:9999,details:{note:"x".repeat(4*1024*1024)},createdBy:owner.id}).returning();
 await expect(exportRecordHistory(f.db,familyId,owner,assetId)).rejects.toMatchObject({code:"HISTORY_EXPORT_LIMIT"});
 await f.db.delete(s.detailHistory).where(eq(s.detailHistory.id,row.id));
});
it("audits successful exports only and rejects oversized sections without truncation",async()=>{
 await f.db.insert(s.detailHistory).values(Array.from({length:1001},(_,i)=>({familyId,recordId:loanId,recordVersion:i+500,details:{note:"test"},createdBy:owner.id})));
 const before=await f.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.recordId,loanId),eq(s.auditLogs.action,"record.history.exported")));
 await expect(exportRecordHistory(f.db,familyId,owner,loanId)).rejects.toMatchObject({code:"HISTORY_EXPORT_LIMIT"});
 const after=await f.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.recordId,loanId),eq(s.auditLogs.action,"record.history.exported")));expect(after.length).toBe(before.length);
 const logs=await f.db.select().from(s.auditLogs).where(eq(s.auditLogs.action,"record.history.exported"));expect(logs.length).toBeGreaterThan(0);
});
