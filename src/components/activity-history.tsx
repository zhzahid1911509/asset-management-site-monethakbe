"use client";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../lib/client";
import type { activityHistory } from "../server/activity";
import { Button } from "./button";
type Page = Awaited<ReturnType<typeof activityHistory>>;
const groups = ["all","record","asset","liability","document","reminder","member","family","notifications","records"];
const bnGroups = ["সব","রেকর্ড","সম্পদ","দায়","নথি","অনুস্মারক","সদস্য","পরিবার","বিজ্ঞপ্তি","রপ্তানি"];
const actions: Record<string,[string,string]> = {
  "member.reinvited":["Member re-invited","সদস্যকে আবার আমন্ত্রণ"],
  "member.rejoined":["Member rejoined","সদস্য আবার যোগদান করেছেন"],
  "record.history.exported":["Record history exported","রেকর্ডের ইতিহাস রপ্তানি"],
  "record.created":["Record created","রেকর্ড তৈরি"],"record.edited":["Record edited","রেকর্ড সম্পাদনা"],
  "record.archived":["Record archived","রেকর্ড সংরক্ষণ"],"record.restored":["Record restored","রেকর্ড পুনরুদ্ধার"],
  "record.details.updated":["Details updated","বিস্তারিত হালনাগাদ"],"record.access.changed":["Access changed","অনুমতি পরিবর্তন"],
  "asset.valued":["Valuation recorded","মূল্যায়ন যোগ"],"asset.ownership.updated":["Ownership updated","মালিকানা হালনাগাদ"],
  "liability.payment.recorded":["Payment recorded","পরিশোধ যোগ"],"liability.payment.reversed":["Payment reversed","পরিশোধ বাতিল"],
  "member.invited":["Member invited","সদস্যকে আমন্ত্রণ"],"member.joined":["Member joined","সদস্য যোগদান"],"member.revoked":["Membership revoked","সদস্যপদ প্রত্যাহার"],
  "family.created":["Workspace created","কর্মক্ষেত্র তৈরি"],"records.exported":["Records exported","রেকর্ড রপ্তানি"],
  "document.upload-started":["Upload started","আপলোড শুরু"],"document.uploaded":["Document uploaded","নথি আপলোড"],
  "document.downloaded":["Document downloaded","নথি ডাউনলোড"],"document.previewed":["Document previewed","নথি দেখা"],
  "reminder.created":["Reminder created","অনুস্মারক তৈরি"],"reminder.updated":["Reminder updated","অনুস্মারক হালনাগাদ"],
  "notifications.preferences-updated":["Email preferences updated","ইমেইল পছন্দ হালনাগাদ"],
};
function actionLabel(action:string,bn:boolean) {
  const parts=action.split(":");
  if(parts.length===2 && parts[0]==="member.invitation.cancelled")
    return `${bn ? "আমন্ত্রণ বাতিল" : "Invitation cancelled"} (${parts[1]})`;
  if(parts.length===4 && parts[0]==="member.role.changed")
    return `${bn ? "সদস্যের ভূমিকা পরিবর্তন" : "Member role changed"}: ${parts[2]} → ${parts[3]} (${parts[1]})`;
  return actions[action]?.[bn?1:0] ?? action;
}
export function ActivityHistory({familyId,locale}:{familyId:string;locale:string}) {
  const bn=locale==="bn";
  const [filters,setFilters]=useState({group:"all",from:"",to:""});
  const [applied,setApplied]=useState(filters);
  const [page,setPage]=useState<Page>({entries:[],nextCursor:null});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const serial=useRef(0);
  async function load(next:typeof filters,cursor?:NonNullable<Page["nextCursor"]>) {
    const seq=++serial.current;setBusy(true);setError("");
    try {
      const result=await api<Page>(`families/${familyId}/activity`,"POST",{
        group:next.group,...(next.from?{from:next.from}:{}),...(next.to?{to:next.to}:{}),...(cursor?{cursor}:{}),
      });
      if(seq!==serial.current)return;
      setPage(result);setApplied(next);
    } catch(e) {if(seq===serial.current){setError(errorText(e));setPage({entries:[],nextCursor:null});}}
    finally {if(seq===serial.current)setBusy(false);}
  }
  useEffect(()=>{void load({group:"all",from:"",to:""});return()=>{serial.current++;};},[familyId]);
  return <section className="panel settings-panel span-two" aria-busy={busy}>
    <h2>{bn?"কর্মক্ষেত্রের কার্যক্রম":"Workspace activity"}</h2>
    <p className="muted">{bn?"অনুমতিপ্রাপ্ত কার্যক্রমের ইতিহাস। তারিখ ও সময়: বাংলাদেশ।":"Authorized activity history. Dates and times use Bangladesh time."}</p>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();void load(filters);}}>
      <label>{bn?"ধরন":"Type"}<select value={filters.group} disabled={busy} onChange={e=>setFilters({...filters,group:e.target.value})}>{groups.map((g,i)=><option key={g} value={g}>{bn?bnGroups[i]:g==="all"?"All activity":g}</option>)}</select></label>
      <label>{bn?"শুরুর তারিখ":"From date"}<input type="date" value={filters.from} disabled={busy} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
      <label>{bn?"শেষ তারিখ":"Through date"}<input type="date" value={filters.to} min={filters.from||undefined} disabled={busy} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
      <Button disabled={busy} type="submit">{busy?(bn?"লোড হচ্ছে…":"Loading…"):(bn?"খুঁজুন / রিফ্রেশ":"Apply / refresh")}</Button>
    </form>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {!busy&&!error&&!page.entries.length&&<p role="status">{bn?"এই ফিল্টারে কোনো কার্যক্রম নেই।":"No activity matches these filters."}</p>}
    <ol className="activity-list">{page.entries.map(entry=><li key={entry.id}>
      <strong>{actionLabel(entry.action,bn)}</strong>
      <p>{entry.recordName??(bn?"কর্মক্ষেত্র":"Workspace")} · {entry.actorName??(bn?"অজানা ব্যবহারকারী":"Unknown user")}</p>
      <time dateTime={entry.time}>{new Date(entry.time).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}</time>
      <details><summary>{bn?"ইভেন্টের তথ্য":"Event details"}</summary><small>{entry.action}<br/>{entry.id}</small></details>
    </li>)}</ol>
    {page.nextCursor&&<Button disabled={busy} onClick={()=>void load(applied,page.nextCursor!)}>{bn?"আগের কার্যক্রম":"Older activity"}</Button>}
    <p className="fine-print">{bn?"প্রতি পাতায় সর্বোচ্চ ২৫টি ঘটনা। বর্তমান নাম দেখানো হচ্ছে। এটি তথ্য পুনরুদ্ধারের ব্যাকআপ নয়।":"Up to 25 events per page. Names reflect current records and profiles. This history is not a restorable backup."}</p>
  </section>;
}
