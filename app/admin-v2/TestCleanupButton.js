"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TestCleanupButton({ requestId = null, deleteAll = false }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const label = deleteAll ? "Borrar historial" : "Borrar OT";

  async function handleDelete() {
    const message = deleteAll
      ? "Esto borrará TODAS las OTs materializadas del historial de pruebas. ¿Continuar?"
      : "Esto borrará esta OT materializada del historial de pruebas. ¿Continuar?";
    if (!window.confirm(message)) return;

    setBusy(true);
    try {
      const response = await fetch("/api/admin-v2/test-cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(deleteAll ? { deleteAll: true } : { requestId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo borrar");
      router.refresh();
    } catch (error) {
      window.alert(error.message || "No se pudo borrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      style={{ border: "1px solid #d7dde8", background: "white", borderRadius: 10, padding: "8px 12px", cursor: busy ? "wait" : "pointer", fontWeight: 700, color: "#b42318" }}
    >
      {busy ? "Borrando…" : label}
    </button>
  );
}
