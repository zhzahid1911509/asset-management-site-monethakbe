"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "./button";
export function HistoryExport({familyId,recordId,locale}:{familyId:string;recordId:string;locale:string}) {
 const bn=locale==="bn";
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const active=useRef(true),controller=useRef<AbortController|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();};},[]);
 async function download(){
  if(!confirmed||busy)return;
  setBusy(true);setError("");setDone(false);controller.current=new AbortController();
  try {
   const res=await fetch(`/api/families/${familyId}/records/${recordId}/history-export`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmed:true}),cache:"no-store",signal:controller.current.signal});
   if(!res.ok){const data=await res.json();throw new Error(data.error?.message??"Export failed.");}
   const blob=await res.blob();if(!active.current)return;
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`monethakbe-history-${recordId}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setDone(true);setConfirmed(false);
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Export failed.");}
  finally{if(active.current)setBusy(false);}
 }
 return <section className="section-form">
  <h3>{bn?"ইতিহাস ডাউনলোড":"Download record history"}</h3>
  <p>{bn?"মূল্যায়ন, পরিশোধ, মালিকানা, অনুস্মারক ও নথির তথ্য JSON ফাইলে থাকবে। আপলোড করা ফাইলের বিষয়বস্তু থাকবে না; এটি পুনরুদ্ধারযোগ্য ব্যাকআপ নয়।":"Download valuations, payments, ownership, reminders and document metadata as JSON. Uploaded file contents are excluded; this is not a restorable backup."}</p>
  <label className="owner-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{bn?"এই রেকর্ডের ব্যক্তিগত তথ্য ডাউনলোড করতে চাই এবং ফাইলটি নিরাপদে রাখব।":"I want to download this record’s private history and will store the file securely."}</label>
  <Button type="button" disabled={!confirmed||busy} onClick={()=>void download()}>{busy?(bn?"প্রস্তুত হচ্ছে…":"Preparing…"):(bn?"JSON ইতিহাস ডাউনলোড":"Download history JSON")}</Button>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {done&&<p role="status">{bn?"ডাউনলোড শুরু হয়েছে।":"Download started."}</p>}
 </section>;
}
