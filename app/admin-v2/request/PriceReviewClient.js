"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./review.module.css";

const EDITABLE_FIELDS = [
  ["precio_lista_venta", "Precio lista venta"],
  ["bono_cidef", "Bono CIDEF lista"],
  ["bono_cierre_venta", "Bono cierre lista"],
  ["bono_fin_venta", "Bono financiamiento lista"],
  ["descuentos_dealer", "Descuento dealer aprobado"],
];
const READ_ONLY_FIELDS = [
  ["lista_precio_utilizada", "Lista de precios utilizada", "text"],
  ["price_version_id", "Versión precio", "text"],
  ["pdv_ok", "PDV", "text"],
  ["bono_dif", "Diferencia precio calculada", "money"],
  ["bono_cierre", "Bono cierre a pagar", "money"],
  ["bono_fin", "Bono financiamiento a pagar", "money"],
  ["total_devolver", "Total devolución", "money"],
];
const BONUS_FIELDS = new Set(["bono_cidef", "bono_cierre_venta", "bono_fin_venta", "bono_dif", "bono_cierre", "bono_fin"]);

function money(value){if(value===null||value===undefined||value==="")return"-";const number=Number(value);return Number.isFinite(number)?`$ ${Math.trunc(number).toLocaleString("es-CL")}`:"-";}
function display(value,kind){return kind==="money"?money(value):(value===null||value===undefined||value===""?"-":String(value));}
function ok(value){return String(value||"").toUpperCase()==="OK";}
function bonusApplies(request,key){
  const base=ok(request.fc_status)&&ok(request.fv_status)&&ok(request.inscripcion_status);
  if(key==="bono_fin_venta"||key==="bono_fin")return base&&ok(request.financiamiento_status);
  if(key==="bono_dif")return ok(request.fc_status)&&ok(request.fv_status);
  return base;
}
function Applicability({request,field}){if(!BONUS_FIELDS.has(field))return null;const applies=bonusApplies(request,field);return <span className={applies?styles.applies:styles.notApplies}>{applies?"APLICA":"NO APLICA"}</span>;}
function XlsViewport({requestId,filename,modelLabel}){
  const [frameUrl,setFrameUrl]=useState("");const [hovered,setHovered]=useState(false);
  useEffect(()=>{const source=`${window.location.origin}/api/admin/price-list-file?request_id=${encodeURIComponent(requestId)}`;setFrameUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`);},[requestId]);
  useEffect(()=>{if(!hovered)return undefined;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[hovered]);
  const originalUrl=useMemo(()=>`/api/admin/price-list-file?request_id=${encodeURIComponent(requestId)}`,[requestId]);
  return <><div className={styles.priceLookupHint}><small>Buscar en el XLS</small><strong>{modelLabel||"Modelo / versión no identificados"}</strong></div><div className={styles.xlsViewport} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>{frameUrl?<iframe className={styles.xlsFrame} src={frameUrl} title={`Lista de precios ${filename||""}`}/>:<div className={styles.noFile}>Cargando lista de precios...</div>}</div><div className={styles.originalAction}><a href={originalUrl} target="_blank" rel="noreferrer">Abrir XLS original</a></div></>;
}

export default function PriceReviewClient({request,priceEvidence}){
  const router=useRouter();
  const [values,setValues]=useState(Object.fromEntries(EDITABLE_FIELDS.map(([key])=>[key,request[key]??""])));
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const modelLabel=[priceEvidence?.modelo||request.modelo,priceEvidence?.version].filter(Boolean).join(" · ");
  const summaryHref=`/admin-v2/request?id=${encodeURIComponent(request.id)}&stage=summary`;
  async function recalculate(){if(busy)return;setBusy(true);setMessage("");try{const response=await fetch("/api/admin/requests/recalculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:request.id,...values})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"No fue posible recalcular");setMessage("Cálculo actualizado");router.refresh();}catch(error){setMessage(error.message||"No fue posible recalcular");}finally{setBusy(false);}}
  return <><div className={styles.documentHeader}><div><strong>PRECIOS · Paso final de validación</strong><span>{request.lista_precio_utilizada||"Lista de precios no identificada"}</span></div><div className={styles.documentNav}><button type="button" className={styles.navButton} onClick={()=>router.back()}>← Anterior</button><span className={styles.pending}>VALIDAR</span></div></div><section className={styles.grid}><div className={styles.visualPanel}><div className={styles.panelTitle}>Lista de precios original</div>{request.lista_precio_utilizada?<XlsViewport requestId={request.id} filename={request.lista_precio_utilizada} modelLabel={modelLabel}/>:<div className={styles.noFile}>No existe una lista de precios vinculada al cálculo.</div>}</div><div className={styles.dataPanel}><div className={styles.panelTitle}>Campos a validar</div><div className={styles.fields}>{READ_ONLY_FIELDS.slice(0,2).map(([key,label,kind])=><div className={styles.fieldRow} key={key}><div className={styles.fieldText}><small>{label}</small><strong>{display(request[key],kind)}</strong></div></div>)}{EDITABLE_FIELDS.map(([key,label])=><div className={styles.fieldRow} key={key}><div className={styles.fieldText}><small>{label}</small><input type="number" min="0" step="1" value={values[key]} onChange={(e)=>setValues((current)=>({...current,[key]:e.target.value}))}/></div><Applicability request={request} field={key}/></div>)}{READ_ONLY_FIELDS.slice(2).map(([key,label,kind])=><div className={styles.fieldRow} key={key}><div className={styles.fieldText}><small>{label}</small><strong>{display(request[key],kind)}</strong></div><Applicability request={request} field={key}/></div>)}</div>{message?<p className={styles.error}>{message}</p>:null}<button type="button" className={styles.approve} disabled={busy} onClick={recalculate}>{busy?"Recalculando...":"Recalcular con montos corregidos"}</button><div className={styles.stepActions}><button type="button" className={styles.secondaryButton} onClick={()=>router.back()}>← Anterior</button><a className={styles.continueButton} href={summaryHref}>Validar precios y ver consolidado →</a></div></div></section></>;
}
