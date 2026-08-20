import {
  REVIEW_STATUS,
  documentCorrectionReason,
  documentReviewStatus,
} from "./document_review_status.js";

function normRut(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
}

function normVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const DOC_META = {
  fv: { type: "FV", required: true },
  fc: { type: "FC", required: true },
  ins: { type: "INSCRIPCION", required: true },
  fin: { type: "FINANCIAMIENTO", required: false },
  repo: { type: "REPOSICION", required: false },
};

function documentStatuses(documents) {
  const finRequired = Boolean(documents.fv?.financiamiento);
  return Object.fromEntries(Object.entries(DOC_META).map(([key, meta]) => [
    key,
    documentReviewStatus(documents[key], { required: key === "fin" ? finRequired : meta.required }),
  ]));
}

function issue(code, kind, documentType = null, context = {}) {
  return { code, kind, document_type: documentType, context };
}

export function buildBonusOperationClosure({ vin, documents, identityResolution = null, exhaustedIssues = [], isFinal = false }) {
  const normalizedVin = normVin(vin);
  const statuses = documentStatuses(documents);
  const issues = [];
  const missing = [];

  for (const [key, status] of Object.entries(statuses)) {
    const meta = DOC_META[key];
    if (status === REVIEW_STATUS.FALTA) missing.push(meta.type);
    if (status === REVIEW_STATUS.REQUIERE_CORRECCION) {
      issues.push(issue(
        `${meta.type}:${documentCorrectionReason(documents[key]) || "REQUIERE_CORRECCION"}`,
        "EXTRACTION",
        meta.type,
        { status: documents[key]?.status ?? null },
      ));
    }
  }

  if (documents.fc?.vin && normVin(documents.fc.vin) !== normalizedVin) {
    issues.push(issue("FC_VIN_MISMATCH", "CROSS_DOCUMENT", "FC", { expected_vin: normalizedVin }));
  }
  if (documents.ins?.vin && normVin(documents.ins.vin) !== normalizedVin) {
    issues.push(issue("INS_VIN_MISMATCH", "CROSS_DOCUMENT", "INSCRIPCION", { expected_vin: normalizedVin }));
  }
  if (documents.repo?.vin_original && normVin(documents.repo.vin_original) !== normalizedVin) {
    issues.push(issue("REPO_VIN_ORIGINAL_MISMATCH", "CROSS_DOCUMENT", "REPOSICION", { expected_vin: normalizedVin }));
  }
  if (documents.repo?.vin_nuevo && normVin(documents.repo.vin_nuevo) === normalizedVin) {
    issues.push(issue("REPO_VIN_NUEVO_EQUALS_ORIGINAL", "CROSS_DOCUMENT", "REPOSICION", { original_vin: normalizedVin }));
  }

  const fvRut = normRut(documents.fv?.rut_cliente);
  const insRut = normRut(documents.ins?.rut_adquirente);
  const identityResolved = identityResolution?.status === "RESOLVED";
  if (fvRut && insRut && fvRut !== insRut && !identityResolved) {
    issues.push(issue("INS_RUT_CLIENTE_MISMATCH", "IDENTITY", "FV", {
      fv_rut_cliente: documents.fv?.rut_cliente ?? null,
      ins_rut_adquirente: documents.ins?.rut_adquirente ?? null,
      ins_nombre_adquirente: documents.ins?.nombre_adquirente ?? null,
    }));
  }

  const resolvedRut = identityResolution?.rut_cliente ?? documents.fv?.rut_cliente ?? null;
  if (documents.fin?.rut_cliente && resolvedRut && normRut(documents.fin.rut_cliente) !== normRut(resolvedRut)) {
    issues.push(issue("FIN_RUT_CLIENTE_MISMATCH", "CROSS_DOCUMENT", "FINANCIAMIENTO", { expected_rut: resolvedRut }));
  }

  const uniqueIssues = [...new Map(issues.map((entry) => [entry.code, entry])).values()];
  const exhausted = new Set(exhaustedIssues);
  const material = uniqueIssues.some((entry) => entry.kind === "CROSS_DOCUMENT" || entry.kind === "IDENTITY");
  const cierreEstado = material ? "ROJO" : missing.length || uniqueIssues.length || exhausted.size ? "AMARILLO" : "VERDE";
  const requiereRevisionHumana = isFinal && (exhausted.size > 0 || cierreEstado === "ROJO");
  const auditStatus = isFinal
    ? requiereRevisionHumana ? "REQUIERE_REVISION_HUMANA" : "RESUELTO_AUTOMATICAMENTE"
    : "PENDIENTE_AUDITORIA";

  return {
    vin: normalizedVin,
    cierre_estado: cierreEstado,
    requiere_revision_humana: requiereRevisionHumana,
    audit_status: auditStatus,
    document_statuses: statuses,
    documentos_faltantes: missing,
    issues: uniqueIssues,
    inconsistencias: uniqueIssues.map((entry) => entry.code),
    exhausted_issues: [...exhausted],
    identity: identityResolution,
    nombre_cliente: identityResolution?.nombre_cliente ?? documents.fv?.nombre_cliente ?? null,
    rut_cliente: resolvedRut,
  };
}
