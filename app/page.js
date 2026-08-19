"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_PARALLEL_UPLOADS = 4;

function money(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value));
}

function statusLabel(status) {
  if (status === "APROBADO") return "Aprobado";
  if (status === "FALTA_DOCUMENTO") return "Falta documento";
  if (status === "EN_REVISION") return "En revisión";
  return "Procesando";
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Error ${response.status}`);
  }
}

async function uploadWithLimit(tasks, limit, onProgress) {
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      await tasks[index]();
      completed += 1;
      onProgress(completed, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
}

export default function Home() {
  const filesInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const correctionInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [operations, setOperations] = useState([]);
  const [loadingOperations, setLoadingOperations] = useState(true);
  const [target, setTarget] = useState(null);

  const refreshOperations = useCallback(async () => {
    try {
      const response = await fetch("/api/dealer/operations", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "No fue posible cargar operaciones");
      setOperations(data.operations || []);
    } catch (err) {
      setError(err.message || "No fue posible cargar operaciones");
    } finally {
      setLoadingOperations(false);
    }
  }, []);

  useEffect(() => {
    refreshOperations();
    const timer = window.setInterval(refreshOperations, 15000);
    return () => window.clearInterval(timer);
  }, [refreshOperations]);

  const kpis = useMemo(() => ({
    active: operations.filter((x) => x.status !== "APROBADO").length,
    approved: operations.filter((x) => x.status === "APROBADO").length,
    observations: operations.filter((x) => x.status === "FALTA_DOCUMENTO").length,
  }), [operations]);

  function chooseFiles(selected) {
    const valid = Array.from(selected || []).filter((file) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type),
    );
    setFiles(valid);
    setError("");
    setMessage("");
  }

  function onDrop(event) {
    event.preventDefault();
    if (uploading) return;
    chooseFiles(event.dataTransfer.files);
  }

  async function sendFiles(selectedFiles, actionTarget = null) {
    if (!selectedFiles.length || uploading) return;

    setUploading(true);
    setError("");
    setMessage("");
    setProgress({ done: 0, total: selectedFiles.length });

    try {
      const response = await fetch("/api/r2/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: selectedFiles.map((file) => ({ name: file.name, size: file.size, type: file.type })),
          target_vin: actionTarget?.vin || null,
          target_document_type: actionTarget?.document_type || null,
        }),
      });
      const signed = await readJson(response);
      if (!response.ok || !signed.ok) throw new Error(signed.error || "No fue posible preparar la carga");

      const validUploads = signed.uploads.filter((item) => item.ok);
      const firstUploadIndex = validUploads[0]?.index;
      let firstPageKey = null;

      const tasks = validUploads.map((upload) => async () => {
        const file = selectedFiles[upload.index];
        const put = await fetch(upload.upload_url, {
          method: "PUT",
          headers: { "Content-Type": upload.content_type },
          body: file,
        });
        if (!put.ok) throw new Error(`Falló la subida de ${file.name}`);

        const normalizeResponse = await fetch("/api/r2_normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: upload.key, content_type: upload.content_type }),
        });
        const normalized = await readJson(normalizeResponse);
        if (!normalizeResponse.ok || !normalized.ok) {
          throw new Error(normalized.error || `Falló la conversión de ${file.name}`);
        }

        if (upload.index === firstUploadIndex && normalized.pages?.[0]?.key) {
          firstPageKey = normalized.pages[0].key;
        }
      });

      await uploadWithLimit(tasks, MAX_PARALLEL_UPLOADS, (done, total) => setProgress({ done, total }));

      if (firstPageKey) {
        const routerResponse = await fetch("/api/document-router", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: firstPageKey }),
        });
        const routed = await readJson(routerResponse);
        if (!routerResponse.ok || !routed.ok) {
          throw new Error(routed.error || "Falló la clasificación del primer JPG");
        }
      }

      setFiles([]);
      setTarget(null);
      if (filesInputRef.current) filesInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      if (correctionInputRef.current) correctionInputRef.current.value = "";
      setMessage(actionTarget ? `Documento procesado para ${actionTarget.vin}.` : `${selectedFiles.length} archivos convertidos a JPG.`);
      await refreshOperations();
    } catch (err) {
      setError(err.message || "Error al enviar los documentos");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    await sendFiles(files, null);
  }

  function activateAction(operation) {
    if (!operation.action) return;
    setTarget({ vin: operation.vin, document_type: operation.action.document_type, label: operation.action.label });
    window.setTimeout(() => correctionInputRef.current?.click(), 0);
  }

  async function correctionSelected(event) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length || !target) return;
    await sendFiles(selected, target);
  }

  return (
    <main className="appShell">
      <section className="topPanel">
        <div>
          <div className="eyebrow">CIDEF · Bonos Dealers</div>
          <h1>Documentos</h1>
          <p className="intro">Sube una carpeta completa o varios archivos. Nosotros ordenamos y procesamos el lote.</p>
        </div>

        <div
          className={`uploadZone ${files.length ? "hasFiles" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <strong>{files.length ? `${files.length} archivos listos` : "Arrastra tus documentos aquí"}</strong>
          <span>{files.length ? "Puedes enviarlos todos juntos" : "PDF, JPG, PNG o WEBP"}</span>
          <div className="pickerRow">
            <button type="button" className="pickerButton" disabled={uploading} onClick={() => filesInputRef.current?.click()}>Seleccionar archivos</button>
            <button type="button" className="pickerButton secondary" disabled={uploading} onClick={() => folderInputRef.current?.click()}>Seleccionar carpeta</button>
          </div>
          <input ref={filesInputRef} className="hiddenInput" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(e) => chooseFiles(e.target.files)} />
          <input ref={folderInputRef} className="hiddenInput" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple webkitdirectory="" directory="" onChange={(e) => chooseFiles(e.target.files)} />
          <input ref={correctionInputRef} className="hiddenInput" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple={false} onChange={correctionSelected} />
        </div>

        {files.length > 0 && (
          <button type="button" className="sendButton" disabled={uploading} onClick={submit}>
            {uploading ? `Procesando ${progress.done}/${progress.total}` : "Enviar"}
          </button>
        )}

        {uploading && <div className="progressTrack"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
        {message && <p className="successMessage">{message}</p>}
        {error && <p className="errorMessage">{error}</p>}
      </section>

      <section className="consolePanel">
        <div className="consoleHeader">
          <div>
            <h2>Operaciones</h2>
            <p>Seguimiento de VIN enviados.</p>
          </div>
          <div className="kpis">
            <div><span>Activos</span><strong>{kpis.active}</strong></div>
            <div><span>Aprobados</span><strong>{kpis.approved}</strong></div>
            <div><span>Observaciones</span><strong>{kpis.observations}</strong></div>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>VIN</th><th>Estado</th><th>Monto</th><th>Enviado</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {operations.map((operation) => (
                <tr key={operation.id}>
                  <td className="vinCell">{operation.vin}</td>
                  <td><span className={`status ${operation.status.toLowerCase()}`}>{statusLabel(operation.status)}</span></td>
                  <td>{money(operation.amount)}</td>
                  <td>{operation.days_sent === 0 ? "Hoy" : `${operation.days_sent} d`}</td>
                  <td>{operation.action ? <button type="button" className="actionButton" disabled={uploading} onClick={() => activateAction(operation)}>{operation.action.label}</button> : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {!loadingOperations && operations.length === 0 && <tr><td colSpan="5" className="emptyState">Todavía no hay operaciones.</td></tr>}
              {loadingOperations && <tr><td colSpan="5" className="emptyState">Cargando...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
