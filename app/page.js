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
  const [fvRut, setFvRut] = useState("");
  const [status, setStatus] = useState({});

  function setDocStatus(type, value) {
    setStatus((current) => ({ ...current, [type.toLowerCase()]: value }));
  }

  async function testDocument(type) {
    const key = type.toLowerCase();
    const file = files[key];
    if (!file) return setMessage(`Selecciona primero el ${type}.`);
    if (!vin.trim()) return setMessage("Falta VIN.");
    if (type === "CARTA" && !fvRut) return setMessage("Primero valida la FV para obtener el RUT del cliente.");

    setUploading(true);
    setDocStatus(type, "loading");
    setMessage(`Subiendo y procesando ${type}...`);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("vin", vin.trim().toUpperCase());
      body.append("document_type", type);
      if (type === "CARTA") body.append("expected_rut", fvRut);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Error de subida");

      const x = result.extraction;

      if (type === "CARTA") {
        if (x?.status !== "OK") {
          setDocStatus(type, "error");
          if (x?.status === "INVALID_DOCUMENT") return setMessage("El archivo subido no corresponde a una CARTA DE APROBACIÓN de Forum.");
          if (x?.status === "RUT_MISMATCH") return setMessage(`La CARTA Forum no corresponde al cliente de la FV. RUT carta: ${x?.rut_documento || "no leído"}.`);
          return setMessage(`CARTA Forum inválida: ${x?.status || "ERROR"}.`);
        }
        setDocStatus(type, "ok");
        return setMessage(`OK · CARTA Forum · RUT ${x.rut_documento}`);
      }

      if (!x?.vin_match) {
        setDocStatus(type, "error");
        return setMessage(`${x?.status || "ERROR"} · VIN documento: ${x?.vin_documento || "no leído"}`);
      }

      if (type === "INSCRIP" && x?.documento_valido === false) {
        setDocStatus(type, "error");
        return setMessage("El archivo subido no corresponde a una Solicitud Electrónica de Primera Inscripción R.V.M.");
      }

      setDocStatus(type, "ok");

      if (type === "FC") {
        return setMessage(`OK · VIN ${x.vin_documento} · Folio ${x.folio_factura_compra ?? "null"} · Fecha ${x.fecha_factura_compra ?? "null"} · Total ${x.precio_compra_total ?? "null"} · Nota venta ${x.nota_venta ?? "null"}`);
      }

      if (type === "FV") {
        const requiresForum = x.financiado_forum === true;
        setForumRequired(requiresForum);
        setFvRut(x.rut_cliente || "");
        if (!requiresForum) {
          setFiles((current) => ({ ...current, carta: null }));
          setStatus((current) => ({ ...current, carta: undefined }));
        }
        return setMessage(`OK · VIN ${x.vin_documento} · Folio ${x.folio_factura_venta ?? "null"} · Fecha ${x.fecha_factura_venta ?? "null"} · Total ${x.precio_venta_total ?? "null"} · Forum ${x.financiado_forum ?? "null"} · RUT ${x.rut_cliente ?? "null"}`);
      }

      if (type === "INSCRIP") {
        return setMessage(`OK · VIN inscripción ${x.vin_documento}`);
      }
    } catch (error) {
      setDocStatus(type, "error");
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const requiredKeys = ["fv", "fc", "inscrip", ...(forumRequired ? ["carta"] : [])];
    const missing = requiredKeys.filter((key) => !files[key]);
    const notValidated = requiredKeys.filter((key) => status[key] !== "ok");

    if (!vin.trim()) return setMessage("Falta VIN.");
    if (missing.length) return setMessage(`Faltan documentos: ${missing.join(", ").toUpperCase()}.`);
    if (notValidated.length) return setMessage(`Hay documentos sin validar o con error: ${notValidated.join(", ").toUpperCase()}.`);

    setMessage("Operación lista para enviar.");
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
              const state = status[doc.key];

              return (
                <label className="upload" key={doc.key} style={disabled ? { opacity: 0.45 } : undefined}>
                  <div>
                    <strong>{doc.label} <span className={`statusDot ${state || "idle"}`} /></strong>
                    <small>{required ? "Obligatorio" : isCarta ? "Se habilita si FV indica Forum" : "Opcional"}</small>
                  </div>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={disabled}
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] || null;
                      setFiles((current) => ({ ...current, [doc.key]: nextFile }));
                      setStatus((current) => ({ ...current, [doc.key]: undefined }));
                    }}
                  />
                  <span className="fileName">{files[doc.key]?.name || (disabled ? "Deshabilitado" : "Seleccionar archivo")}</span>
                </label>
              );
            })}
          </div>

          <button type="button" onClick={() => testDocument("FC")} disabled={uploading}>Probar FC</button>
          <button type="button" onClick={() => testDocument("FV")} disabled={uploading}>Probar FV</button>
          <button type="button" onClick={() => testDocument("INSCRIP")} disabled={uploading}>Probar INSCRIP</button>
          {forumRequired && <button type="button" onClick={() => testDocument("CARTA")} disabled={uploading}>Probar CARTA Forum</button>}
          <button type="submit" disabled={uploading}>Enviar</button>
          {message && <p className="message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
