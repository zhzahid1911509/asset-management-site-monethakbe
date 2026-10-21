"use client";
import { useRef, useEffect, useId } from "react";
import { X } from "lucide-react";
export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  const titleId=useId(), ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    if(!dialog)return;
    const viewport=window.visualViewport;
    const syncViewport=()=>{
      // Do not counteract pinch zoom. Only track the unzoomed keyboard viewport.
      if(viewport && viewport.scale===1){
        dialog.style.setProperty("--dialog-height",`${viewport.height}px`);
        dialog.style.setProperty("--dialog-top",`${viewport.offsetTop}px`);
      }
    };
    syncViewport();
    viewport?.addEventListener("resize",syncViewport);
    viewport?.addEventListener("scroll",syncViewport);
    const y=window.scrollY;
    const body=document.body;
    const previous={position:body.style.position,top:body.style.top,width:body.style.width,overflow:body.style.overflow};
    body.style.position="fixed";body.style.top=`-${y}px`;body.style.width="100%";body.style.overflow="hidden";
    dialog.showModal();
    return()=>{
      viewport?.removeEventListener("resize",syncViewport);
      viewport?.removeEventListener("scroll",syncViewport);
      dialog.close();
      Object.assign(body.style,previous);
      window.scrollTo({top:y,behavior:"instant"});
    };
  },[]);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose}>
    <header>
      <h2 id={titleId}>{title}</h2>
      <button type="button" autoFocus aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={20}/></button>
    </header>
    <div className="modal-body">{children}</div>
  </dialog>;
}
