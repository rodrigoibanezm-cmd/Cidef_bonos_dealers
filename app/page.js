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
  const [forumRequired, setForumRequired] = useState(false);

  async function testDocument(type) {
    const key = type.toLowerCase();
    const file = files[key];
    if (!file) return setMessage(`Selecciona primero el ${type}.`);
    if (!vin.trim()) return setMessage("Falta VIN.");

    setUploading(true);
    setMessage(`Subiendo y procesando ${type}...`);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("vin", vin.trim().toUpperCase());
      body.append("document_type", type);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Error de subida");

      const x = result.extraction;
      if (!x?.vin_match) {
        return setMessage(`${x?.status || "ERROR"} · VIN documento: ${x?.vin_documento || "no leído"}`);
      }

      if (type === "FC") {
        return setMessage(`OK · VIN ${x.vin_documento} · Folio ${x.folio_factura_compra ?? "null"} · Fecha ${x.fecha_factura_compra ?? "null"} · Total ${x.precio_compra_total ?? "null"} · Nota venta ${x.nota_venta ?? "null"}`);
      }

      if (type === "FV") {
        const requiresForum = x.financiado_forum === true;
        setForumRequired(requiresForum);
        if (!requiresForum) {
          setFiles((current) => ({ ...current, carta: null }));
        }
        return setMessage(`OK · VIN ${x.vin_documento} · Folio ${x.folio_factura_venta ?? "null"} · Fecha ${x.fecha_factura_venta ?? "null"} · Total ${x.precio_venta_total ?? "null"} · Forum ${x.financiado_forum ?? "null"}`);
      }

      if (type === "INSCRIP") {
        return setMessage(`OK · VIN inscripción ${x.vin_documento}`);
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
    if (forumRequired && !files.carta) return setMessage("Falta CARTA · Forum.");
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
            <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="Ej. LVAV2MAB5TU475588" autoComplete="off" />
          </label>

          <div className="docs">
            {DOCS.map((doc) => {
              const isCarta = doc.key === "carta";
              const disabled = isCarta && !forumRequired;
              const required = doc.required || (isCarta && forumRequired);

              return (
                <label className="upload" key={doc.key} style={disabled ? { opacity: 0.45 } : undefined}>
                  <div>
                    <strong>{doc.label}</strong>
                    <small>{required ? "Obligatorio" : isCarta ? "Se habilita si FV indica Forum" : "Opcional"}</small>
                  </div>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={disabled}
                    onChange={(e) => setFiles((current) => ({ ...current, [doc.key]: e.target.files?.[0] || null }))}
                  />
                  <span className="fileName">{files[doc.key]?.name || (disabled ? "Deshabilitado" : "Seleccionar archivo")}</span>
                </label>
              );
            })}
          </div>

          <button type="button" onClick={() => testDocument("FC")} disabled={uploading}>Probar FC</button>
          <button type="button" onClick={() => testDocument("FV")} disabled={uploading}>Probar FV</button>
          <button type="button" onClick={() => testDocument("INSCRIP")} disabled={uploading}>Probar INSCRIP</button>
          <button type="submit">Continuar</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
