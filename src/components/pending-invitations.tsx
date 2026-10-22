"use client";
import {useEffect,useRef,useState} from "react";
import {api,errorText} from "../lib/client";
import {Button} from "./button";
type Cursor={before:string;beforeId:string};
type Page={entries:Array<{id:string;email:string;role:string;expiresAt:string;createdAt:string;reactivation:boolean}>;nextCursor:Cursor|null};
export function PendingInvitations({familyId,locale,refreshKey}:{familyId:string;locale:string;refreshKey:number}) {
  const bn=locale==="bn";
  const [page,setPage]=useState<Page>({entries:[],nextCursor:null});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const serial=useRef(0);
  async function load(cursor?:Cursor) {
    const seq=++serial.current;setBusy(true);setError("");
    try {
      const suffix=cursor?"?"+new URLSearchParams(cursor).toString():"";
      const result=await api<Page>(`families/${familyId}/invitations${suffix}`);
      if(seq===serial.current)setPage(result);
    } catch(e) {if(seq===serial.current){setError(errorText(e));setPage({entries:[],nextCursor:null});}}
    finally {if(seq===serial.current)setBusy(false);}
  }
  useEffect(()=>{setNotice("");void load();return()=>{serial.current++;};},[familyId,refreshKey]);
  return <section className="panel settings-panel">
    <h2>{bn?"অপেক্ষমাণ আমন্ত্রণ":"Pending invitations"}</h2>
    <p className="muted">{bn?"প্রতি পাতায় সর্বোচ্চ ২৫টি অব্যবহৃত ও মেয়াদযুক্ত আমন্ত্রণ। বাতিল করলে লিংক অকার্যকর হবে; ইতিমধ্যে পাঠানো ইমেইল ফেরত নেওয়া যাবে না।":"Up to 25 unused, unexpired invitations per page. Cancelling disables the link; it cannot recall an email already sent."}</p>
    <Button variant="secondary" disabled={busy} onClick={()=>{setNotice("");void load();}}>{bn?"রিফ্রেশ / প্রথম পাতা":"Refresh / first page"}</Button>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {notice&&<p className="notice" role="status">{notice}</p>}
    {busy&&<p role="status">{bn?"লোড হচ্ছে…":"Loading…"}</p>}
    {!busy&&!error&&page.entries.length===0&&<p>{bn?"এই পাতায় অপেক্ষমাণ আমন্ত্রণ নেই।":"No pending invitations on this page."}</p>}
    <div className="pending-invitation-list" aria-busy={busy}>
      {page.entries.map(inv=><article key={inv.id}>
        <div><strong>{inv.email}</strong><p>{inv.role}{inv.reactivation?(bn?" · পুনরায় যোগদানের আমন্ত্রণ":" · Re-invitation"):""}</p>
        <small>{bn?"মেয়াদ শেষ":"Expires"}: {new Date(inv.expiresAt).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})} ({bn?"ঢাকা সময়":"Dhaka time"})</small></div>
        <Button variant="danger" disabled={busy} onClick={async()=>{
          if(!window.confirm(bn?`${inv.email}-এর আমন্ত্রণ বাতিল করবেন?`:`Cancel the invitation for ${inv.email}?`))return;
          const seq=++serial.current;setBusy(true);setError("");setNotice("");
          try {
            await api(`families/${familyId}/invitations/${inv.id}`,"DELETE",{confirmed:true});
            if(seq!==serial.current)return;
            setNotice(bn?"আমন্ত্রণের লিংক অকার্যকর করা হয়েছে।":"Invitation link disabled.");
            await load();
          }catch(e){if(seq===serial.current){setError(errorText(e));setBusy(false);}}
        }}>{bn?"আমন্ত্রণ বাতিল":"Cancel invitation"}</Button>
      </article>)}
    </div>
    {page.nextCursor&&<Button variant="secondary" disabled={busy} onClick={()=>void load(page.nextCursor!)}>{bn?"পরের পাতা":"Next page"}</Button>}
  </section>;
}
