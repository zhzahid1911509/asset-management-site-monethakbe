import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and, like } from "drizzle-orm";
import { testDatabase } from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
let f: Awaited<ReturnType<typeof testDatabase>>, family: string;
const owner = {id:"role-owner",email:"owner@example.test"};
beforeAll(async()=>{f=await testDatabase(); await f.db.insert(s.user).values({...owner,name:"Owner",emailVerified:true}); family=(await service.createFamily(f.db,owner,{name:"Role family"})).id;});
afterAll(async()=>{await f.client.close();});
async function target(role="member", expiresAt:Date|null=null, active=true, familyId=family){
 const actor={id:randomUUID(),email:randomUUID()+"@example.test"};
 await f.db.insert(s.user).values({...actor,name:"Test member",emailVerified:true});
 const [m]=await f.db.insert(s.memberships).values({familyId,userId:actor.id,role,expiresAt,active}).returning();
 return {actor,m};
}
const change=(id:string,role:string,expectedRole="member",a=owner)=>service.changeMemberRole(f.db,family,a,id,{role,expectedRole,confirmed:true});
const get=async(id:string)=>(await f.db.select().from(s.memberships).where(eq(s.memberships.id,id)))[0];
it("changes roles and writes an identifiable before/after audit event",async()=>{
 const {m}=await target();await change(m.id,"administrator");expect((await get(m.id)).role).toBe("administrator");
 const logs=await f.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.familyId,family),eq(s.auditLogs.action,`member.role.changed:${m.id}:member:administrator`)));
 expect(logs).toHaveLength(1);expect(logs[0].actorId).toBe(owner.id);
});
it("blocks non-owner actors including administrators",async()=>{
 const {m}=await target();for(const role of ["administrator","member","read-only","adviser"]){const {actor}=await target(role);await expect(change(m.id,"administrator","member",actor)).rejects.toMatchObject({code:"FORBIDDEN"});}
 expect((await get(m.id)).role).toBe("member");
});
it("blocks owner edits, owner assignment and missing confirmation",async()=>{
 const [m]=await f.db.select().from(s.memberships).where(and(eq(s.memberships.familyId,family),eq(s.memberships.userId,owner.id)));
 await expect(change(m.id,"member")).rejects.toMatchObject({code:"FORBIDDEN"});
 const t=await target();await expect(change(t.m.id,"owner")).rejects.toThrow();
 await expect(service.changeMemberRole(f.db,family,owner,t.m.id,{role:"administrator",expectedRole:"member",confirmed:false})).rejects.toThrow();
});
it("rejects stale role submissions without another audit event",async()=>{
 const {m}=await target();await change(m.id,"read-only");await expect(change(m.id,"administrator")).rejects.toMatchObject({code:"MEMBER_CONFLICT"});
 expect((await get(m.id)).role).toBe("read-only");
 const logs=await f.db.select().from(s.auditLogs).where(like(s.auditLogs.action,`member.role.changed:${m.id}:%`));expect(logs).toHaveLength(1);
});
it("rejects inactive, expired and cross-family targets",async()=>{
 for(const t of [await target("member",null,false),await target("member",new Date(Date.now()-1000))])await expect(change(t.m.id,"administrator")).rejects.toMatchObject({code:"MEMBER_INACTIVE"});
 const other=(await service.createFamily(f.db,owner,{name:"Other family"})).id;
 const t=await target("member",null,true,other);await expect(change(t.m.id,"administrator")).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("caps new adviser access and never extends an existing expiry",async()=>{
 const {m}=await target();const before=Date.now();await change(m.id,"adviser");const expiry=(await get(m.id)).expiresAt!;
 expect(expiry.getTime()).toBeGreaterThanOrEqual(before+30*86400000);expect(expiry.getTime()).toBeLessThanOrEqual(Date.now()+30*86400000);
 await change(m.id,"member","adviser");expect((await get(m.id)).expiresAt).toEqual(expiry);
 const short=new Date(Date.now()+86400000);const t=await target("member",short);await change(t.m.id,"adviser");expect((await get(t.m.id)).expiresAt).toEqual(short);
});
it("keeps explicit denials when promoting, and removes implicit admin access when demoting",async()=>{
 const t=await target();const record=await service.createRecord(f.db,family,owner,{kind:"asset",typeCode:"property.apartment",name:"Restricted asset",asOf:"2026-01-01"},randomUUID());
 await service.setGrant(f.db,family,owner,record.id,{membershipId:t.m.id,action:"view",effect:"deny"});await change(t.m.id,"administrator");
 await expect(service.authorized(f.db,family,t.actor,record.id,"view")).rejects.toMatchObject({code:"NOT_FOUND"});
 const admin=await target("administrator");await expect(service.authorized(f.db,family,admin.actor,record.id,"edit")).resolves.toBeDefined();
 await change(admin.m.id,"read-only","administrator");await expect(service.authorized(f.db,family,admin.actor,record.id,"view")).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("same-role confirmations do not duplicate audit events",async()=>{
 const {m}=await target();await change(m.id,"member");const logs=await f.db.select().from(s.auditLogs).where(like(s.auditLogs.action,`member.role.changed:${m.id}:%`));expect(logs).toHaveLength(0);
});
