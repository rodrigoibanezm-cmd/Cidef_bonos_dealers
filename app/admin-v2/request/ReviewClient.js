"use client";

import { useMemo, useState } from "react";
import styles from "./review.module.css";

function displayValue(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function ReviewClient({ requestId, document, fields, step, total, canApprove }) {
  const initial = document.reviewed_extraction || document.extraction || {};
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const fileUrl = document.file_url || "";
  const title = `${document.document_type} · Documento ${step} de ${total}`;
  const editableFields = useMemo(() => fields.filter(([key]) => Object.prototype.hasOwnProperty.call(values, key)), [fields, values]);

  async function approve() {
    if (!canApprove || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/requests/approve-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, document_type: document.document_type, reviewed_extraction: values }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible aprobar el documento");
      window.location.href = result.request_approved ? "/admin-v2" : `/admin-v2/request?id=${encodeURIComponent(requestId)}`;
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.documentHeader}>
        <div><strong>{title}</strong><span>{document.file_name || document.document_type}</span></div>
        <span className={styles.pending}>PENDIENTE</span>
      </div>

      <section className={styles.grid}>
        <div className={styles.visualPanel}>
          <div className={styles.panelTitle}>Documento original</div>
          {fileUrl ? <iframe className={styles.viewer} src={fileUrl} title={document.file_name || document.document_type} /> : <div className={styles.noFile}>Documento sin URL disponible.</div>}
        </div>

        <div className={styles.dataPanel}>
          <div className={styles.panelTitle}>Datos extraídos</div>
          <div className={styles.fields}>
            {editableFields.length ? editableFields.map(([key, label]) => {
              const isEditing = Boolean(editing[key]);
              return (
                <div className={styles.fieldRow} key={key}>
                  <div className={styles.fieldText}><small>{label}</small>{isEditing ? (
                    <input value={values[key] ?? ""} onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))} />
                  ) : <strong>{displayValue(values[key])}</strong>}</div>
                  <button type="button" className={isEditing ? styles.okButton : styles.editButton} onClick={() => setEditing((current) => ({ ...current, [key]: !isEditing }))}>{isEditing ? "OK" : "Editar"}</button>
                </div>
              );
            }) : <div className={styles.noFields}>Este documento no aporta campos editables. Se valida visualmente completo.</div>}
          </div>

          {!canApprove ? <p className={styles.warning}>Falta configurar la identidad del supervisor para firmar aprobaciones.</p> : null}
          {message ? <p className={styles.error}>{message}</p> : null}
          <button type="button" className={styles.approve} disabled={!canApprove || busy} onClick={approve}>{busy ? "Aprobando..." : `Aprobar ${document.document_type} y continuar →`}</button>
        </div>
      </section>
    </>
  );
}
