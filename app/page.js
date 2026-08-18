"use client";

import { useRef, useState } from "react";

export default function Home() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setResult(null);
    setError("");
  }

  async function submit() {
    if (!files.length || processing) return;

    setProcessing(true);
    setResult(null);
    setError("");

    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));

      const response = await fetch("/api/normalize-upload", {
        method: "POST",
        body,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No fue posible procesar los documentos");

      setResult({
        total_vins: data.total_vins ?? null,
        approved_ops: data.approved_ops ?? null,
        files_received: data.files_received ?? files.length,
        pages_created: data.jpg_pages_created ?? 0,
      });
    } catch (err) {
      setError(err.message || "Error al procesar los documentos");
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className="shell">
      <section className="card batchCard">
        <div className="eyebrow">CIDEF · Bonos Dealers</div>
        <h1>Carga de documentos</h1>
        <p className="intro">Selecciona una carpeta o varios archivos y envíalos en una sola carga.</p>

        {!processing && !result && (
          <>
            <input
              ref={inputRef}
              className="hiddenInput"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              webkitdirectory=""
              directory=""
              onChange={selectFiles}
            />

            <button type="button" className="selectButton" onClick={() => inputRef.current?.click()}>
              Seleccionar carpeta o archivos
            </button>

            {files.length > 0 && (
              <div className="selectionSummary">
                <strong>{files.length} archivos seleccionados</strong>
                <span>Listos para enviar</span>
              </div>
            )}

            <button type="button" onClick={submit} disabled={!files.length}>
              Enviar
            </button>
          </>
        )}

        {processing && (
          <div className="processingBox">
            <div className="spinner" />
            <strong>Procesando documentos...</strong>
            <span>Estamos preparando todos los archivos.</span>
          </div>
        )}

        {result && (
          <div className="resultBox">
            <div className="resultRow">
              <span>Total</span>
              <strong>{result.total_vins ?? "—"} VIN</strong>
            </div>
            <div className="resultRow">
              <span>Aprobadas</span>
              <strong>{result.approved_ops ?? "—"} ops</strong>
            </div>
            <div className="resultMeta">
              {result.files_received} archivos · {result.pages_created} páginas procesadas
            </div>
            <button type="button" onClick={reset}>Nueva carga</button>
          </div>
        )}

        {error && <p className="message errorMessage">{error}</p>}
      </section>
    </main>
  );
}
