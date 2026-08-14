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
  const [uploading, setUploading] = useState(false);

  async function testFcUpload() {
    const file = files.fc;
    if (!file) return setMessage("Selecciona primero el FC.");
    if (!vin.trim()) return setMessage("Falta VIN.");

    setUploading(true);
    setMessage("Subiendo y validando VIN...");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("vin", vin.trim().toUpperCase());
      body.append("document_type", "FC");

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Error de subida");

      const validation = result.validation;
      if (validation?.vin_match) {
        setMessage(`OK · VIN coincide: ${validation.vin_documento}`);
      } else {
        setMessage(`${validation?.status || "ERROR"} · VIN documento: ${validation?.vin_documento || "no leído"}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

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

          <button type="button" onClick={testFcUpload} disabled={uploading}>
            {uploading ? "Validando..." : "Probar FC → Drive + VIN"}
          </button>
          <button type="submit">Continuar</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
