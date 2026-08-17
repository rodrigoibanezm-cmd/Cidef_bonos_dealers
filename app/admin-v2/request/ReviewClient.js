"use client";

import { useMemo, useState } from "react";
import styles from "./review.module.css";

const DATE_FIELDS = new Set(["fecha_factura_compra", "fecha_factura_venta"]);

function formatDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "-";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function displayValue(key, value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "-";
  if (DATE_FIELDS.has(key)) return formatDate(value);
  return String(value);
}

export default function ReviewClient({ requestId, document, fields, step, total, auditors }) {
  const initial = document.reviewed_extraction || document.extraction || {};
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState({});
  const [auditorId, setAuditorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previewUrl = `/api/admin/document-thumbnail?request_id=${encodeURIComponent(requestId)}&document_type=${encodeURIComponent(document.document_type)}`;
  const originalUrl = `/api/admin/document-file?request_id=${encodeURIComponent(requestId)}&document_type=${encodeURIComponent(document.document_type)}`;
  const editableFields = useMemo(() => fields.filter(([key]) => Object.prototype.hasOwnProperty.call(values, key)), [fields, values]);

  async function approve() {
    if (!auditorId || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/requests/approve-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: requestId, document_type: document.document_type, auditor_id: auditorId, reviewed_extraction: values }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible aprobar el documento");
      window.location.href = result.request_approved ? "/admin-v2" : `/admin-v2/request?id=${encodeURIComponent(requestId)}`;
    } catch (error) { setMessage(error.message); setBusy(false); }
  }

  return <>
    <div className={styles.documentHeader}><div><strong>{document.document_type} · Documento {step} de {total}</strong><span>{document.file_name || document.document_type}</span></div><span className={styles.pending}>PENDIENTE</span></div>
    <section className={styles.grid}>
      <div className={styles.visualPanel}>
        <div className={styles.panelTitle}>Documento original</div>
        <div className={styles.imageStage}><img className={styles.reviewImage} src={previewUrl} alt={document.file_name || document.document_type} /></div>
        <div className={styles.originalAction}><a href={originalUrl} target="_blank" rel="noreferrer">Abrir original</a></div>
      </div>
      <div className={styles.dataPanel}>
        <div className={styles.panelTitle}>Datos extraídos</div>
        <div className={styles.fields}>{editableFields.length ? editableFields.map(([key, label]) => { const isEditing = Boolean(editing[key]); return <div className={styles.fieldRow} key={key}><div className={styles.fieldText}><small>{label}</small>{isEditing ? <input value={values[key] ?? ""} onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))} /> : <strong>{displayValue(key, values[key])}</strong>}</div><button type="button" className={isEditing ? styles.okButton : styles.editButton} onClick={() => setEditing((current) => ({ ...current, [key]: !isEditing }))}>{isEditing ? "OK" : "Editar"}</button></div>; }) : <div className={styles.noFields}>Este documento no aporta campos editables. Se valida visualmente completo.</div>}</div>
        <label className={styles.auditorLabel}>Auditor<select value={auditorId} onChange={(e) => setAuditorId(e.target.value)}><option value="">Seleccionar auditor</option>{auditors.map((auditor) => <option key={auditor.id} value={auditor.id}>{auditor.name}</option>)}</select></label>
        {!auditors.length ? <p className={styles.warning}>No hay auditores activos configurados.</p> : null}
        {message ? <p className={styles.error}>{message}</p> : null}
        <button type="button" className={styles.approve} disabled={!auditorId || busy} onClick={approve}>{busy ? "Aprobando..." : `Aprobar ${document.document_type} y continuar →`}</button>
      </div>
    </section>
  </>;
}
