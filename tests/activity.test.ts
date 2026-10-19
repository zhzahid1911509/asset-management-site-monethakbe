import {beforeAll,afterAll,beforeEach,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {testDatabase} from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import {activityHistory} from "../src/server/activity";
let f:Awaited<ReturnType<typeof testDatabase>>,familyId:string,otherId:string,recordId:string,ownerMember:string,adminMember:string;
const owner={id:"activity-owner",email:"owner@example.test"},admin={id:"activity-admin",email:"admin@example.test"},reader={id:"activity-reader",email:"reader@example.test"},outsider={id:"activity-outsider",email:"outsider@example.test"};
beforeAll(async()=>{
 f=await testDatabase();
 await f.db.insert(s.user).values([owner,admin,reader,outsider].map(a=>({...a,name:a.id,emailVerified:true})));
 familyId=(await service.createFamily(f.db,owner,{name:"Activity family"})).id;
 otherId=(await service.createFamily(f.db,outsider,{name:"Other family"})).id;
 ownerMember=(await f.db.select().from(s.memberships).where(eq(s.memberships.familyId,familyId)))[0].id;
 adminMember=(await f.db.insert(s.memberships).values({familyId,userId:admin.id,role:"administrator"}).returning())[0].id;
 await f.db.insert(s.memberships).values({familyId,userId:reader.id,role:"read-only"});
 recordId=(await service.createRecord(f.db,familyId,owner,{kind:"asset",typeCode:"property.apartment",name:"Private home",amount:"100",ownershipPercent:"100",asOf:"2026-01-01"},randomUUID())).id;
});
afterAll(async()=>{await f.client.close();});
beforeEach(async()=>{
 await f.db.delete(s.auditLogs);await f.db.delete(s.recordGrants);
 await f.db.update(s.memberships).set({active:true,expiresAt:null});
});
const insert=(action="record.edited",record:string|null=recordId,family=familyId,time=new Date())=>f.db.insert(s.auditLogs).values({familyId:family,actorId:owner.id,action,recordId:record,createdAt:time}).returning();
it("lists actor, action and permitted record for owner/admin",async()=>{
 await insert();
 for(const actor of [owner,admin]){const result=await activityHistory(f.db,familyId,actor,{});expect(result.entries).toHaveLength(1);expect(result.entries[0].recordName).toBe("Private home");expect(result.entries[0].actorName).toBe(owner.id);}
});
it("denies ordinary members and outsiders",async()=>{
 await expect(activityHistory(f.db,familyId,reader,{})).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(activityHistory(f.db,familyId,outsider,{})).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("does not expose another workspace",async()=>{
 await insert("family.created",null,otherId);
 expect((await activityHistory(f.db,familyId,owner,{})).entries).toHaveLength(0);
});
it("filters denied records before pagination including for owners",async()=>{
 await insert();await insert("family.created",null);
 await f.db.insert(s.recordGrants).values({familyId,recordId,membershipId:ownerMember,action:"view",effect:"deny"});
 const result=await activityHistory(f.db,familyId,owner,{limit:1});
 expect(result.entries[0].action).toBe("family.created");expect(result.nextCursor).toBeNull();
});
it("rechecks membership and view denials on every page",async()=>{
 await insert();await f.db.update(s.memberships).set({active:false}).where(eq(s.memberships.id,adminMember));
 await expect(activityHistory(f.db,familyId,admin,{})).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("honors inclusive Bangladesh date filters and action groups",async()=>{
 await insert("record.edited",recordId,familyId,new Date("2026-10-18T18:00:00Z"));
 await insert("record.created",recordId,familyId,new Date("2026-10-19T18:00:00Z"));
 await insert("family.created",null,familyId,new Date("2026-10-19T00:00:00Z"));
 const r=await activityHistory(f.db,familyId,owner,{group:"record",from:"2026-10-19",to:"2026-10-19"});
 expect(r.entries.map(e=>e.action)).toEqual(["record.edited"]);
});
it("preserves microseconds and deterministic ordering across pages",async()=>{
 for(const micro of ["000001","000002","000002"]){const [row]=await insert();await f.db.execute(sql`update audit_logs set created_at=${"2026-10-19T00:00:00."+micro+"Z"}::timestamptz where id=${row.id}`);}
 const seen:string[]=[];let cursor: {time:string;id:string}|undefined;
 do{const page=await activityHistory(f.db,familyId,owner,{limit:1,...(cursor?{cursor}:{})});seen.push(...page.entries.map(e=>e.id));cursor=page.nextCursor??undefined;}while(cursor);
 expect(seen).toHaveLength(3);expect(new Set(seen).size).toBe(3);
});
it("rejects invalid dates, excessive limits, unknown groups and malformed cursors",async()=>{
 for(const input of [{from:"2026-02-30"},{from:"2026-10-20",to:"2026-10-19"},{limit:51},{group:"secret"},{cursor:{id:"bad",time:"now"}},{extra:true}])await expect(activityHistory(f.db,familyId,owner,input)).rejects.toBeDefined();
});
it("hides dangling or cross-family record references",async()=>{
 await insert("record.edited",randomUUID());
 expect((await activityHistory(f.db,familyId,owner,{})).entries).toHaveLength(0);
});
