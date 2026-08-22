import { getBonusRequestForReview } from "../../../lib/approval_workflow.js";
import { listBonusAuditors } from "../../../lib/auditors.js";
import ReviewClient from "./ReviewClient.js";
import FinalApprovalClient from "./FinalApprovalClient.js";
import RecalculatePriceClient from "./RecalculatePriceClient.js";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

const FIELD_MAP = {
  FC: [["folio_factura_compra", "Folio factura compra"], ["fecha_factura_compra", "Fecha factura compra"], ["precio_compra_total", "Total factura compra"], ["nota_venta", "Nota de venta"], ["vin", "VIN"]],
  FV: [["folio_factura_venta", "Folio factura venta"], ["fecha_factura_venta", "Fecha factura venta"], ["precio_venta_total", "Total factura venta"], ["nombre_facturado", "Facturado a"], ["rut_facturado", "RUT facturado"], ["nombre_compra_para", "Compra para"], ["rut_compra_para", "RUT compra para"], ["vin", "VIN"]],
  INSCRIPCION: [["vin", "VIN inscripción"], ["nombre_adquirente", "Adquirente"], ["rut_adquirente", "RUT adquirente"], ["ppu", "PPU"], ["marca", "Marca"], ["modelo", "Modelo"]],
  FINANCIAMIENTO: [["nombre_cliente", "Cliente"], ["rut_cliente", "RUT cliente"], ["financiera", "Financiera"], ["monto_financiado", "Monto financiado"], ["numero_operacion", "Número operación"]],
  REPOSICION: [["vin_original", "VIN operación"], ["vin_nuevo", "VIN reposición"], ["fecha", "Fecha reposición"], ["monto_total", "Monto reposición"]],
};

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter(Boolean) : []; }
  catch { return []; }
}
function money(value) { if (value === null || value === undefined || value === "") return "-"; const number = Number(value); return Number.isFinite(number) ? `$ ${Math.trunc(number).toLocaleString("es-CL")}` : "-"; }
function AuditSummary({ request }) {
  const cierre=String(request.cierre_estado||"").toUpperCase(); const inconsistencias=asList(request.inconsistencias); const tone=cierre==="ROJO"?styles.auditRed:request.requiere_revision_humana||cierre==="AMARILLO"?styles.auditYellow:styles.auditGreen;
  return <section className={`${styles.auditSummary} ${tone}`}><div className={styles.auditHeadline}><div><small>Resultado auditor automático</small><strong>{cierre||"SIN CIERRE"}</strong></div><span>{request.audit_status||"SIN ESTADO"}</span></div><div className={styles.auditBody}><div><small>Documentación</small><strong>{request.documentacion_estado||"-"}</strong></div><div><small>Revisión humana</small><strong>{request.requiere_revision_humana?"Requerida":"No requerida"}</strong></div><div className={styles.auditObservations}><small>Observaciones activas</small>{inconsistencias.length?<ul>{inconsistencias.map((item)=><li key={item}>{item}</li>)}</ul>:<strong>Sin observaciones</strong>}</div></div></section>;
}
function InventoryFcSummary({ evidence }) {
  if (!evidence?.fc_reconstruida) return null;
  return <section className={styles.inventoryFc}><div className={styles.inventoryFcHeader}><div><small>Factura de compra</small><strong>FC reconstruida desde inventario</strong></div><span>INFORMATIVO</span></div><p>Factura de compra no aportada por dealer. Datos reconstruidos desde inventario interno CIDEF por VIN.</p><div className={styles.inventoryFcGrid}><div><small>Factura</small><strong>{evidence.folio_factura_compra || "-"}</strong></div><div><small>Fecha</small><strong>{evidence.fecha_factura_compra || "-"}</strong></div><div><small>Monto</small><strong>{money(evidence.precio_compra_total)}</strong></div><div><small>Dealer</small><strong>{evidence.dealer || "-"}</strong></div><div><small>Marca / modelo</small><strong>{[evidence.marca,evidence.modelo].filter(Boolean).join(" · ") || "-"}</strong></div><div><small>Fuente</small><strong>{evidence.source_table || "inventario_vehiculos_global_raw"}</strong></div></div></section>;
}
function PriceSummary({ request, auditors }) {
  return <section className={styles.priceSummary}><div className={styles.priceHeader}><div><small>Cálculo final</small><strong>Origen del precio y bonos</strong></div><span>{request.price_lookup_status||"SIN LOOKUP"}</span></div><div className={styles.priceGrid}><div><small>Lista de precios utilizada</small><strong>{request.lista_precio_utilizada||"-"}</strong></div><div><small>Versión precio</small><strong>{request.price_version_id||"-"}</strong></div><div><small>Precio lista venta</small><strong>{money(request.precio_lista_venta)}</strong></div><div><small>Bono CIDEF lista</small><strong>{money(request.bono_cidef)}</strong></div><div><small>Bono cierre lista</small><strong>{money(request.bono_cierre_venta)}</strong></div><div><small>Bono financiamiento lista</small><strong>{money(request.bono_fin_venta)}</strong></div><div><small>Descuento dealer aprobado</small><strong>{money(request.descuentos_dealer)}</strong></div><div><small>PDV</small><strong>{request.pdv_ok||"-"}</strong></div><div><small>Diferencia precio calculada</small><strong>{money(request.bono_dif)}</strong></div><div><small>Bono cierre a pagar</small><strong>{money(request.bono_cierre)}</strong></div><div><small>Bono financiamiento a pagar</small><strong>{money(request.bono_fin)}</strong></div><div className={styles.priceTotal}><small>Total devolución</small><strong>{money(request.total_devolver)}</strong></div></div><RecalculatePriceClient requestId={request.id} currentDiscount={request.descuentos_dealer}/><FinalApprovalClient requestId={request.id} auditors={auditors}/></section>;
}

export default async function RequestReviewPage({ searchParams }) {
  const params=await searchParams; const id=String(params?.id||"").trim(); const requestedDoc=String(params?.doc||"").trim().toUpperCase();
  const [review,auditors]=await Promise.all([id?getBonusRequestForReview(id):null,listBonusAuditors()]);
  if(!review)return <main className={styles.screen}><a className={styles.back} href="/admin-v2">← Volver</a><p>Solicitud no encontrada.</p></main>;
  const sequenceDocs=review.sequence.map((type)=>review.documents.find((x)=>x.document_type===type)).filter(Boolean);
  const defaultType=sequenceDocs[0]?.document_type || "";
  const selectedType=sequenceDocs.some((x)=>x.document_type===requestedDoc)?requestedDoc:defaultType;
  const current=sequenceDocs.find((x)=>x.document_type===selectedType)||null;
  const currentIndex=current?sequenceDocs.findIndex((x)=>x.document_type===current.document_type):-1;
  const step=currentIndex>=0?currentIndex+1:sequenceDocs.length;
  const previousType=currentIndex>0?sequenceDocs[currentIndex-1].document_type:null;
  const nextType=currentIndex>=0&&currentIndex<sequenceDocs.length-1?sequenceDocs[currentIndex+1].document_type:null;
  const dealerLabel=review.request.dealer_nombre||"Dealer no identificado";
  const reviewingApprovedDocument=Boolean(review.review_complete&&requestedDoc&&current);
  const firstDocumentHref=defaultType?`/admin-v2/request?id=${encodeURIComponent(review.request.id)}&doc=${encodeURIComponent(defaultType)}`:null;
  return <main className={styles.screen}><header className={styles.header}><a className={styles.back} href="/admin-v2">← Volver a activos</a><div className={styles.topbar}><div><span className={styles.eyebrow}>CIDEF · BONOS DEALERS</span><h1>Revisión · {review.request.vin}</h1><div className={styles.meta}><span>{dealerLabel}</span><span>{review.request.estado}</span><span>{review.review_complete?"Documentos revisados":`Documento ${step} de ${sequenceDocs.length}`}</span></div></div></div></header><AuditSummary request={review.request}/><InventoryFcSummary evidence={review.fc_reconstruction}/>{review.review_complete&&!reviewingApprovedDocument&&firstDocumentHref?<p><a className={styles.back} href={firstDocumentHref}>← Revisar documentos aprobados</a></p>:null}{current&&(!review.review_complete||reviewingApprovedDocument)?<ReviewClient requestId={review.request.id} document={current} fields={FIELD_MAP[current.document_type]||[]} step={step} total={sequenceDocs.length} previousType={previousType} nextType={nextType}/>:review.review_complete?<PriceSummary request={review.request} auditors={auditors}/>:<section className={styles.complete}><strong>Sin documentos materializados para revisión</strong><span>La OT existe, pero todavía no tiene documentos vinculados al flujo de check.</span></section>}</main>;
}
