"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./review.module.css";

export default function RecalculatePriceClient({ requestId, currentDiscount = null }) {
  const [discount, setDiscount] = useState(currentDiscount ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function recalculate() {
    if (busy || discount === "") return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/requests/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, descuento_dealer: Number(discount) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible recalcular");
      setMessage("Cálculo actualizado");
      router.refresh();
    } catch (error) {
      setMessage(error.message || "No fue posible recalcular");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.finalApproval}>
    <label className={styles.auditorLabel}>Descuento dealer
      <input
        type="number"
        min="0"
        step="1"
        value={discount}
        onChange={(e) => setDiscount(e.target.value)}
        placeholder="Monto calculado o corregido"
      />
    </label>
    <small>Se calcula automáticamente como residual. Puedes corregirlo manualmente y recalcular.</small>
    {message ? <p className={styles.error}>{message}</p> : null}
    <button type="button" className={styles.approve} disabled={busy || discount === ""} onClick={recalculate}>
      {busy ? "Recalculando..." : "Recalcular total"}
    </button>
  </div>;
}
