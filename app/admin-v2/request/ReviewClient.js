"use client";

import { useMemo, useState } from "react";
import styles from "./review.module.css";

const DATE_KEY=/fecha|date/i;
const MONEY_KEY=/precio|monto|total|bono|descuento|valor/i;
function formatDate(value){const raw=String(value||"").trim();const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);return m?`${m[3]}-${m[2]}-${m[1]}`:raw||"-";}
function formatClp(value){const normalized=typeof value==="string"?value.replace(/[$.\s]/g,"").replace(",","."):value;const n=Number(normalized);return Number.isFinite(n)?`$${Math.trunc(n).toLocaleString("es-CL")}`:String(value||"-");}
function displayValue(key,value){if(value===true)return"Sí";if(value===false)return"No";if(value===null||value===undefined||value==="")return"-";if(DATE_KEY.test(key))return formatDate(value);if(MONEY_KEY.test(key))return formatClp(value);return String(value);}
function jpgName(document){const key=String(document.file_id||"");const last=key.split("/").pop();return last&&/\.jpe?g$/i.test(last)?last:(document.file_name||document.document_type);}

export default function ReviewClient({requestId,document,fields,step,total,previousType,nextType}){
 const initial=document.reviewed_extraction||document.extraction||{};
 const [values,setValues]=useState(initial);const [editing,setEditing]=useState({});const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const isApproved=String(document.review_status||"").toUpperCase()==="APROBADO";
 const previewUrl=`/api/admin/document-thumbnail?request_id=${encodeURIComponent(requestId)}&document_type=${encodeURIComponent(document.document_type)}`;
 const originalUrl=`/api/admin/document-file?request_id=${encodeURIComponent(requestId)}&document_type=${encodeURIComponent(document.document_type)}`;
 const editableFields=useMemo(()=>fields.filter(([key])=>Object.prototype.hasOwnProperty.call(values,key)),[fields,values]);
 const navHref=(type)=>`/admin-v2/request?id=${encodeURIComponent(requestId)}&doc=${encodeURIComponent(type)}`;
 const priceHref=`/admin-v2/request?id=${encodeURIComponent(requestId)}&stage=prices`;
 async function approve(){if(busy||isApproved)return;setBusy(true);setMessage("");try{const response=await fetch("/api/admin/requests/approve-document",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:requestId,document_type:document.document_type,reviewed_extraction:values})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"No fue posible aprobar el documento");if(result.next_document_type){window.location.href=navHref(result.next_document_type);return;}window.location.href=priceHref;}catch(error){setMessage(error.message);setBusy(false);}}
 return <><div className={styles.documentHeader}><div><strong>{document.document_type} · Documento {step} de {total}</strong><span>{jpgName(document)}</span></div><div className={styles.documentNav}>{previousType?<a href={navHref(previousType)}>← Anterior</a>:<span/>}{nextType?<a href={navHref(nextType)}>Siguiente →</a>:isApproved?<a href={priceHref}>Precios →</a>:<span/>}<span className={isApproved?styles.approved:styles.pending}>{isApproved?"APROBADO":"PENDIENTE"}</span></div></div><section className={styles.grid}><div className={styles.visualPanel}><div className={styles.panelTitle}>Documento original</div><div className={styles.imageStage}><img className={styles.reviewImage} src={previewUrl} alt={jpgName(document)}/></div><div className={styles.originalAction}><a href={originalUrl} target="_blank" rel="noreferrer">Abrir imagen</a></div></div><div className={styles.dataPanel}><div className={styles.panelTitle}>Datos extraídos</div><div className={styles.fields}>{editableFields.length?editableFields.map(([key,label])=>{const isEditing=Boolean(editing[key]);return <div className={styles.fieldRow} key={key}><div className={styles.fieldText}><small>{label}</small>{isEditing?<input value={values[key]??""} onChange={(e)=>setValues((current)=>({...current,[key]:e.target.value}))}/>:<strong>{displayValue(key,values[key])}</strong>}</div>{!isApproved?<button type="button" className={isEditing?styles.okButton:styles.editButton} onClick={()=>setEditing((current)=>({...current,[key]:!isEditing}))}>{isEditing?"OK":"Editar"}</button>:null}</div>}):<div className={styles.noFields}>Este documento no aporta campos editables. Se valida visualmente completo.</div>}</div>{message?<p className={styles.error}>{message}</p>:null}<button type="button" className={styles.approve} disabled={isApproved||busy} onClick={approve}>{isApproved?"APROBADO":busy?"Aprobando...":`Aprobar ${document.document_type} y continuar →`}</button></div></section></>;
}
