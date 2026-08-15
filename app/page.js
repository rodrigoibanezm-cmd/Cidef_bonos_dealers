"use client";

import { useMemo, useState } from "react";

const BASE_STEPS = [
  { key: "fc", type: "FC", label: "Factura compra", optional: false },
  { key: "fv", type: "FV", label: "Factura venta", optional: false },
  { key: "inscrip", type: "INSCRIP", label: "Primera inscripción", optional: false },
];

export default function Home() {
  const [vin, setVin] = useState("");
  const [vinLocked, setVinLocked] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [files, setFiles] = useState({});
  const [status, setStatus] = useState({});
  const [results, setResults] = useState({});
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [forumRequired, setForumRequired] = useState(false);
  const [fvRut, setFvRut] = useState("");
  const [reposSkipped, setReposSkipped] = useState(false);

  const steps = useMemo(() => {
    const list = [...BASE_STEPS];
    if (forumRequired) list.push({ key: "carta", type: "CARTA", label: "Carta Forum", optional: false });
    list.push({ key: "repos", type: "REPOS", label: "Reposición", optional: true });
    return list;
  }, [forumRequired]);

  const currentIndex = steps.findIndex((step) => {
    if (step.key === "repos" && reposSkipped) return false;
    return status[step.key] !== "ok";
  });
  const finished = currentIndex === -1;
  const currentStep = finished ? null : steps[currentIndex];

  function resetOperation() {
    setVinLocked(false);
    setRequestId("");
    setFiles({});
    setStatus({});
    setResults({});
    setMessage("");
    setForumRequired(false);
    setFvRut("");
    setReposSkipped(false);
  }

  function resultMessage(type, x) {
    if (type === "FC") return `VIN ${x.vin_documento} · Folio ${x.folio_factura_compra ?? "-"} · Fecha ${x.fecha_factura_compra ?? "-"} · Total ${x.precio_compra_total ?? "-"}`;
    if (type === "FV") return `VIN ${x.vin_documento} · Folio ${x.folio_factura_venta ?? "-"} · Fecha ${x.fecha_factura_venta ?? "-"} · Total ${x.precio_venta_total ?? "-"} · Forum ${x.financiado_forum === true ? "sí" : "no"}`;
    if (type === "INSCRIP") return `VIN ${x.vin_documento}`;
    if (type === "CARTA") return `RUT cliente ${x.rut_documento}`;
    if (type === "REPOS") return "Documento guardado";
    return "Validado";
  }

  function validationError(type, x) {
    if (type === "CARTA") {
      if (x?.status === "INVALID_DOCUMENT") return "El archivo no corresponde a una CARTA DE APROBACIÓN de Forum.";
      if (x?.status === "RUT_MISMATCH") return `La carta corresponde a otro cliente. RUT detectado: ${x?.rut_documento || "no leído"}.`;
      return `No fue posible validar la carta Forum (${x?.status || "ERROR"}).`;
    }
    if (type === "INSCRIP" && x?.status === "INVALID_DOCUMENT") {
      return "El archivo no corresponde a una Solicitud Electrónica de Primera Inscripción R.V.M.";
    }
    if (!x?.vin_match) {
      if (x?.status === "VIN_MISMATCH") return `El documento corresponde a otro VIN: ${x?.vin_documento || "no leído"}. Sube el documento correcto.`;
      return "No fue posible leer o validar el VIN del documento. Sube una copia más legible.";
    }
    return null;
  }

  async function processFile(step, file) {
    if (!vin.trim()) return setMessage("Ingresa primero el VIN.");
    if (!file) return;
    if (step.type === "CARTA" && !fvRut) return setMessage("Primero debe quedar validada la factura de venta.");

    setVinLocked(true);
    setUploading(true);
    setFiles((current) => ({ ...current, [step.key]: file }));
    setStatus((current) => ({ ...current, [step.key]: "loading" }));
    setMessage(`Validando ${step.label}...`);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("vin", vin.trim().toUpperCase());
      body.append("document_type", step.type);
      if (requestId) body.append("request_id", requestId);
      if (step.type === "CARTA") body.append("expected_rut", fvRut);

      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Error al cargar el documento");

      if (result.request_id && !requestId) setRequestId(result.request_id);
      const x = result.extraction;

      if (step.type === "REPOS") {
        setStatus((current) => ({ ...current, repos: "ok" }));
        setResults((current) => ({ ...current, repos: { summary: "Documento guardado" } }));
        setMessage("Reposición guardada. Operación lista para enviar.");
        return;
      }

      const error = validationError(step.type, x);
      if (error) {
        setStatus((current) => ({ ...current, [step.key]: "error" }));
        setMessage(error);
        return;
      }

      if (step.type === "FV") {
        setForumRequired(x.financiado_forum === true);
        setFvRut(x.rut_cliente || "");
      }

      setStatus((current) => ({ ...current, [step.key]: "ok" }));
      setResults((current) => ({ ...current, [step.key]: { ...x, summary: resultMessage(step.type, x) } }));
      setMessage(`${step.label} validada y guardada.`);
    } catch (error) {
      setStatus((current) => ({ ...current, [step.key]: "error" }));
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  function skipRepos() {
    setReposSkipped(true);
    setMessage("Reposición omitida. Operación lista para enviar.");
  }

  async function submit() {
    if (!finished || !requestId || uploading) return;
    setUploading(true);
    setMessage("Enviando operación...");
    try {
      const response = await fetch("/api/requests/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No fue posible enviar la operación");
      setMessage("Operación ingresada correctamente para revisión.");
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="shell">
      <section className="card wizardCard">
        <div className="eyebrow">CIDEF · Bonos Dealers</div>
        <h1>Nueva operación</h1>
        <p className="intro">Ingresa el VIN una vez. Luego carga cada documento en el orden indicado.</p>

        <label className="field">
          <span>VIN</span>
          <input value={vin} disabled={vinLocked} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="Ej. LVAV2MAB5TU475588" autoComplete="off" />
        </label>

        <div className="progressRow">
          {steps.map((step, index) => {
            const state = step.key === "repos" && reposSkipped ? "skipped" : status[step.key] || (index === currentIndex ? "active" : "locked");
            return <div className={`progressStep ${state}`} key={step.key}><span>{index + 1}</span><small>{step.type}</small></div>;
          })}
        </div>

        <div className="completedDocs">
          {steps.map((step) => status[step.key] === "ok" && (
            <div className="completedDoc" key={step.key}>
              <div><strong>✓ {step.type}</strong><small>{step.label}</small></div>
              <span>{results[step.key]?.summary}</span>
            </div>
          ))}
        </div>

        {!finished && currentStep && (
          <section className={`currentStep ${status[currentStep.key] === "error" ? "hasError" : ""}`}>
            <div className="stepNumber">Paso {currentIndex + 1} de {steps.length}</div>
            <h2>{currentStep.type} · {currentStep.label}</h2>
            <p>{currentStep.optional ? "Documento opcional." : "Este documento debe quedar validado para continuar."}</p>
            <label className="dropZone">
              <input type="file" accept="application/pdf,image/*" disabled={uploading} onChange={(e) => processFile(currentStep, e.target.files?.[0] || null)} />
              <strong>{uploading ? "Validando..." : status[currentStep.key] === "error" ? "Volver a subir documento" : "Seleccionar documento"}</strong>
              <small>{files[currentStep.key]?.name || "PDF"}</small>
            </label>
            {currentStep.key === "repos" && !uploading && <button type="button" className="secondaryButton" onClick={skipRepos}>No hay reposición</button>}
          </section>
        )}

        {finished && (
          <section className="readyBox">
            <strong>✓ Todos los documentos requeridos están validados</strong>
            <p>La operación está lista para enviar a CIDEF.</p>
            <button type="button" onClick={submit} disabled={uploading || !requestId}>{uploading ? "Enviando..." : "Enviar operación"}</button>
          </section>
        )}

        {message && <p className={`message ${currentStep && status[currentStep.key] === "error" ? "errorMessage" : ""}`}>{message}</p>}
        {vinLocked && <button type="button" className="resetButton" onClick={resetOperation} disabled={uploading}>Empezar de nuevo</button>}
      </section>
    </main>
  );
}
