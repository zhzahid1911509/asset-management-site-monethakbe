import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {randomUUID,randomBytes} from "node:crypto";
import {eq,and,desc} from "drizzle-orm";
import {testDatabase} from "./helpers";
import * as s from "../src/db/schema";
import * as service from "../src/server/service";
import {unseal} from "../src/server/secrets";
vi.mock("../src/server/email-events",()=>({notifyEmailJob:vi.fn()}));
let f:Awaited<ReturnType<typeof testDatabase>>,family:string;
const owner={id:"rejoin-owner",email:"owner@example.test"};
beforeAll(async()=>{process.env.APP_ENCRYPTION_KEY=randomBytes(32).toString("base64");process.env.APP_ORIGIN="http://localhost:3000";f=await testDatabase();await f.db.insert(s.user).values({...owner,name:"Owner",emailVerified:true});family=(await service.createFamily(f.db,owner,{name:"Rejoin family"})).id;});
afterAll(async()=>{await f.client.close();});
async function person(active=false,expiresAt:Date|null=null){const a={id:randomUUID(),email:randomUUID()+"@example.test"};await f.db.insert(s.user).values({...a,name:"Test person",emailVerified:true});const[m]=await f.db.insert(s.memberships).values({familyId:family,userId:a.id,role:"member",active,expiresAt}).returning();return{a,m};}
async function invite(email:string,role="read-only"){
 await service.inviteMember(f.db,family,owner,{email,role});
 const [job]=await f.db.select().from(s.emailJobs).orderBy(desc(s.emailJobs.createdAt)).limit(1);
 const message=JSON.parse(unseal(job.payload,"email"));return new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get("token")!;
}
const membership=async(id:string)=>(await f.db.select().from(s.memberships).where(eq(s.memberships.id,id)))[0];
it("reactivates only after acceptance, keeps identity and clears grants/notification opt-in",async()=>{
 const {a,m}=await person();const r=await service.createRecord(f.db,family,owner,{kind:"asset",typeCode:"property.apartment",name:"Private property",asOf:"2026-01-01"},randomUUID());
 await f.db.insert(s.recordGrants).values({familyId:family,recordId:r.id,membershipId:m.id,action:"view",effect:"allow"});
 await f.db.insert(s.notificationPreferences).values({familyId:family,userId:a.id,enabled:true,categories:["other"],advanceDays:[0],timeZone:"Asia/Dhaka",sendAt:"09:00",quietEnabled:false,quietStart:"22:00",quietEnd:"07:00"});
 const token=await invite(a.email);expect((await membership(m.id)).active).toBe(false);
 await service.acceptInvitation(f.db,a,{token});const updated=await membership(m.id);expect(updated.active).toBe(true);expect(updated.role).toBe("read-only");expect(updated.expiresAt).toBeNull();
 expect(await f.db.select().from(s.recordGrants).where(eq(s.recordGrants.membershipId,m.id))).toHaveLength(0);
 const [pref]=await f.db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId,a.id));expect(pref.enabled).toBe(false);expect(pref.version).toBe(2);
 expect((await service.snapshot(f.db,family,a)).records).toHaveLength(0);
 await expect(service.acceptInvitation(f.db,a,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});
});
it("renews expired advisers only on acceptance of a fresh invitation",async()=>{
 const {a,m}=await person(true,new Date(Date.now()-1000));const token=await invite(a.email,"adviser");await service.acceptInvitation(f.db,a,{token});const u=await membership(m.id);expect(u.role).toBe("adviser");expect(u.expiresAt!.getTime()).toBeGreaterThan(Date.now()+29*86400000);
});
it("invalidates superseded links and enforces the latest selected role",async()=>{
 const {a,m}=await person();const old=await invite(a.email,"administrator");const fresh=await invite(a.email,"read-only");await expect(service.acceptInvitation(f.db,a,{token:old})).rejects.toMatchObject({code:"INVALID_INVITATION"});await service.acceptInvitation(f.db,a,{token:fresh});expect((await membership(m.id)).role).toBe("read-only");
});
it("revocation cancels outstanding re-invitations",async()=>{
 const {a,m}=await person();const token=await invite(a.email);await service.revokeMember(f.db,family,owner,m.id);await expect(service.acceptInvitation(f.db,a,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});expect((await membership(m.id)).active).toBe(false);
});
it("rejects active members and non-owner senders",async()=>{
 const {a}=await person(true);await expect(invite(a.email)).rejects.toMatchObject({code:"MEMBER_ALREADY_ACTIVE"});await expect(invite(owner.email)).rejects.toMatchObject({code:"MEMBER_ALREADY_ACTIVE"});await expect(service.inviteMember(f.db,family,a,{email:"new@example.test",role:"member"})).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("wrong-email attempts leave the invitation usable by its recipient",async()=>{
 const {a}=await person();const token=await invite(a.email);await expect(service.acceptInvitation(f.db,owner,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});await expect(service.acceptInvitation(f.db,a,{token})).resolves.toEqual({id:family});
});
it("rejects an invitation whose issuer no longer has active owner access",async()=>{
 const {a}=await person();const token=await invite(a.email);await f.db.update(s.memberships).set({active:false}).where(and(eq(s.memberships.familyId,family),eq(s.memberships.userId,owner.id)));
 try{await expect(service.acceptInvitation(f.db,a,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});}finally{await f.db.update(s.memberships).set({active:true}).where(and(eq(s.memberships.familyId,family),eq(s.memberships.userId,owner.id)));}
});
it("old invitations without reactivation authorization cannot restore a revoked member",async()=>{
 const {a,m}=await person();const token=await invite(a.email);
 await f.db.update(s.invitations).set({reactivationMembershipId:null}).where(eq(s.invitations.email,a.email));
 await expect(service.acceptInvitation(f.db,a,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});expect((await membership(m.id)).active).toBe(false);
});
it("lists only pending invitations without token material",async()=>{
 const {a}=await person();const token=await invite(a.email);const result=await service.listPendingInvitations(f.db,family,owner);
 const entry=result.entries.find(x=>x.email===a.email)!;expect(entry).toBeDefined();expect(entry.reactivation).toBe(true);expect(Object.keys(entry).sort()).toEqual(["id","email","role","expiresAt","createdAt","reactivation"].sort());expect(JSON.stringify(result)).not.toContain(token);
 await service.acceptInvitation(f.db,a,{token});expect((await service.listPendingInvitations(f.db,family,owner)).entries.some(x=>x.id===entry.id)).toBe(false);
});
it("cancellation blocks acceptance, is repeatable and does not activate a member",async()=>{
 const {a,m}=await person();const token=await invite(a.email);const [inv]=await f.db.select().from(s.invitations).where(eq(s.invitations.email,a.email));
 await service.cancelInvitation(f.db,family,owner,inv.id,{confirmed:true});await service.cancelInvitation(f.db,family,owner,inv.id,{confirmed:true});
 await expect(service.acceptInvitation(f.db,a,{token})).rejects.toMatchObject({code:"INVALID_INVITATION"});expect((await membership(m.id)).active).toBe(false);
 const events=await f.db.select().from(s.auditLogs).where(eq(s.auditLogs.action,`member.invitation.cancelled:${inv.id}`));expect(events).toHaveLength(1);
});
it("accepted invitations cannot be cancelled and membership remains active",async()=>{
 const {a,m}=await person();const token=await invite(a.email);const [inv]=await f.db.select().from(s.invitations).where(eq(s.invitations.email,a.email));await service.acceptInvitation(f.db,a,{token});
 await expect(service.cancelInvitation(f.db,family,owner,inv.id,{confirmed:true})).rejects.toMatchObject({code:"INVITATION_ACCEPTED"});expect((await membership(m.id)).active).toBe(true);
});
it("listing and cancellation enforce owner access, family isolation and confirmation",async()=>{
 const {a}=await person(true);await f.db.update(s.memberships).set({role:"administrator"}).where(eq(s.memberships.userId,a.id));
 const t=await person();await invite(t.a.email);const [inv]=await f.db.select().from(s.invitations).where(eq(s.invitations.email,t.a.email));
 await expect(service.listPendingInvitations(f.db,family,a)).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(service.cancelInvitation(f.db,family,a,inv.id,{confirmed:true})).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(service.cancelInvitation(f.db,family,owner,inv.id,{confirmed:false})).rejects.toThrow();
 const other=(await service.createFamily(f.db,owner,{name:"Isolated invitations"})).id;
 expect((await service.listPendingInvitations(f.db,other,owner)).entries).toHaveLength(0);
 await expect(service.cancelInvitation(f.db,other,owner,inv.id,{confirmed:true})).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("paginates same-timestamp invitations without duplicates and excludes expired entries",async()=>{
 const id=(await service.createFamily(f.db,owner,{name:"Pagination"})).id;
 const now=new Date();await f.db.insert(s.invitations).values(Array.from({length:29},(_,i)=>({familyId:id,email:`page${i}@example.test`,role:"member",tokenHash:randomUUID(),createdBy:owner.id,createdAt:now,expiresAt:new Date(Date.now()+(i===28?-1000:3600000))})));
 const first=await service.listPendingInvitations(f.db,id,owner);expect(first.entries).toHaveLength(25);expect(first.nextCursor).not.toBeNull();
 const second=await service.listPendingInvitations(f.db,id,owner,first.nextCursor);expect(second.entries).toHaveLength(3);expect(second.nextCursor).toBeNull();expect(new Set([...first.entries,...second.entries].map(x=>x.id)).size).toBe(28);
 await expect(service.listPendingInvitations(f.db,id,owner,{before:now.toISOString()})).rejects.toThrow();
});
