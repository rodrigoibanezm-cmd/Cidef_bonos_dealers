import { getBonusRequestForReview } from "../../../lib/approval_workflow.js";
import { listBonusAuditors } from "../../../lib/auditors.js";
import ReviewClient from "./ReviewClient.js";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

const FIELD_MAP = {
  FC: [["folio_factura_compra", "Folio factura compra"], ["fecha_factura_compra", "Fecha factura compra"], ["precio_compra_total", "Total factura compra"], ["nota_venta", "Nota de venta"]],
  FV: [["folio_factura_venta", "Folio factura venta"], ["fecha_factura_venta", "Fecha factura venta"], ["precio_venta_total", "Total factura venta"], ["financiado_forum", "Financiado Forum"], ["rut_cliente", "RUT cliente"]],
  INSCRIP: [["vin_documento", "VIN inscripción"]],
  CARTA: [["rut_documento", "RUT cliente"]],
  REPOS: [],
};

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function AuditSummary({ request }) {
  const cierre = String(request.cierre_estado || "").toUpperCase();
  const inconsistencias = asList(request.inconsistencias);
  const tone = cierre === "VERDE" ? styles.auditGreen : cierre === "AMARILLO" ? styles.auditYellow : styles.auditRed;
  const label = cierre || "SIN CIERRE";

  return (
    <section className={`${styles.auditSummary} ${tone}`}>
      <div className={styles.auditHeadline}>
        <div>
          <small>Resultado auditor automático</small>
          <strong>{label}</strong>
        </div>
        <span>{request.audit_status || "SIN ESTADO"}</span>
      </div>
      <div className={styles.auditBody}>
        <div><small>Documentación</small><strong>{request.documentacion_estado || "-"}</strong></div>
        <div><small>Revisión humana</small><strong>{request.requiere_revision_humana ? "Requerida" : "No requerida"}</strong></div>
        <div className={styles.auditObservations}>
          <small>Observaciones activas</small>
          {inconsistencias.length ? <ul>{inconsistencias.map((item) => <li key={item}>{item}</li>)}</ul> : <strong>Sin observaciones</strong>}
        </div>
      </div>
    </section>
  );
}

export default async function RequestReviewPage({ searchParams }) {
  const params = await searchParams;
  const id = String(params?.id || "").trim();
  const [review, auditors] = await Promise.all([id ? getBonusRequestForReview(id) : null, listBonusAuditors()]);

  if (!review) return <main className={styles.screen}><a className={styles.back} href="/admin-v2">← Volver</a><p>Solicitud no encontrada.</p></main>;

  const current = review.documents.find((x) => x.document_type === review.next_document_type) || null;
  const step = current ? review.sequence.indexOf(current.document_type) + 1 : review.sequence.length;
  const dealerLabel = review.request.dealer_nombre || review.request.dealer_id || "Dealer no identificado";

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <a className={styles.back} href="/admin-v2">← Volver a activos</a>
        <div className={styles.topbar}><div><span className={styles.eyebrow}>CIDEF · BONOS DEALERS</span><h1>Revisión · {review.request.vin}</h1><div className={styles.meta}><span>{dealerLabel}</span><span>{review.request.estado}</span><span>{review.review_complete ? "Revisión completa" : `Documento ${step} de ${review.sequence.length}`}</span></div></div></div>
      </header>

      <AuditSummary request={review.request} />

      {review.review_complete ? <section className={styles.complete}><strong>Solicitud aprobada</strong><span>Todos los documentos requeridos fueron revisados.</span></section> : current ? (
        <ReviewClient requestId={review.request.id} document={current} fields={FIELD_MAP[current.document_type] || []} step={step} total={review.sequence.length} auditors={auditors} />
      ) : <section className={styles.complete}><strong>Falta un documento requerido</strong><span>No es posible continuar la revisión.</span></section>}
    </main>
  );
}
