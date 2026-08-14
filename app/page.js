"use client";

import { useState } from "react";

const DOCS = [
  { key: "fv", label: "FV · Factura venta", required: true },
  { key: "fc", label: "FC · Factura compra", required: true },
  { key: "inscrip", label: "INSCRIP · Inscripción", required: true },
  { key: "carta", label: "CARTA · Forum", required: false },
  { key: "repos", label: "REPOS · Reposición", required: false },
];

export default function Home() {
  const [vin, setVin] = useState("");
  const [files, setFiles] = useState({});
  const [message, setMessage] = useState("");

  function submit(event) {
    event.preventDefault();
    const missing = DOCS.filter((d) => d.required && !files[d.key]);
    if (!vin.trim()) return setMessage("Falta VIN.");
    if (missing.length) return setMessage(`Falta: ${missing.map((d) => d.label).join(", ")}`);
    setMessage("Carga completa para continuar al procesamiento.");
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">CIDEF · Bonos Dealers</div>
        <h1>Nueva operación</h1>
        <p className="intro">Ingresa el VIN y adjunta los documentos de respaldo.</p>

        <form onSubmit={submit}>
          <label className="field">
            <span>VIN</span>
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="Ej. LVAV2MAB5TU475588"
              autoComplete="off"
            />
          </label>

          <div className="docs">
            {DOCS.map((doc) => (
              <label className="upload" key={doc.key}>
                <div>
                  <strong>{doc.label}</strong>
                  <small>{doc.required ? "Obligatorio" : "Opcional"}</small>
                </div>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFiles((current) => ({ ...current, [doc.key]: e.target.files?.[0] || null }))}
                />
                <span className="fileName">{files[doc.key]?.name || "Seleccionar archivo"}</span>
              </label>
            ))}
          </div>

          <button type="submit">Continuar</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
