"use client";

import { useState } from "react";
import styles from "./review.module.css";

export default function FinalApprovalClient({ requestId, auditors }) {
  const [auditorId, setAuditorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function approve() {
    if (!auditorId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/requests/approve-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, auditor_id: auditorId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible aprobar la solicitud");
      window.location.href = "/admin-v2";
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return <div className={styles.finalApproval}>
    <label className={styles.auditorLabel}>Auditor
      <select value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
        <option value="">Seleccionar auditor</option>
        {auditors.map((auditor) => <option key={auditor.id} value={auditor.id}>{auditor.name}</option>)}
      </select>
    </label>
    {message ? <p className={styles.error}>{message}</p> : null}
    <button type="button" className={styles.approve} disabled={!auditorId || busy} onClick={approve}>
      {busy ? "Aprobando..." : "Aprobar solicitud completa →"}
    </button>
  </div>;
}
