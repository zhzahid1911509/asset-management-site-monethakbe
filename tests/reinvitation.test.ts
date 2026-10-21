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
