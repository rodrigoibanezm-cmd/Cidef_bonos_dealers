const SOURCE_TYPE_PATTERNS = [
  ["INSCRIPCION", /(?:^|\s|[_-])(INS|INSCRIP|INSCRIPCION)(?:\s|[_-]|\.|$)/i],
  ["FINANCIAMIENTO", /(?:^|\s|[_-])(CARTA|FIN|FINANCIAMIENTO)(?:\s|[_-]|\.|$)/i],
  ["REPOSICION", /(?:^|\s|[_-])(REPO|REPOSICION)(?:\s|[_-]|\.|$)/i],
  ["FC", /(?:^|\s|[_-])FC(?:\s|[_-]|\.|$)/i],
  ["FV", /(?:^|\s|[_-])FV(?:\s|[_-]|\.|$)/i],
];

export function documentTypeHintFromSourceFilename(sourceFilename) {
  const name = String(sourceFilename || "");
  for (const [type, pattern] of SOURCE_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return null;
}

export function guardDocumentRouting({ sourceFilename, classifiedType }) {
  const sourceHint = documentTypeHintFromSourceFilename(sourceFilename);
  if (!sourceHint || classifiedType === "BASURA" || classifiedType === sourceHint) {
    return { allowed: true, sourceHint, reason: null };
  }

  // FC and REPOSICION share the same invoice layout. Their final routing is
  // resolved later by comparing the document Chassis with the operation VIN.
  if (["FC", "REPOSICION"].includes(sourceHint) && ["FC", "REPOSICION"].includes(classifiedType)) {
    return { allowed: true, sourceHint, reason: "FC_REPO_REQUIRES_CHASSIS_RESOLUTION" };
  }

  return {
    allowed: false,
    sourceHint,
    reason: `SOURCE_HINT_${sourceHint}_CONFLICTS_WITH_${classifiedType}`,
  };
}

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

// A global filename hint may select the contract used to verify a conflicting
// page, but only evidence extracted from that page can override the classifier.
// This deliberately supports the known dealer-invoice ambiguity and nothing
// else: unrelated conflicts remain ROUTING_UNCERTAIN.
export function resolveFvRoutingConflict({ sourceHint, classifiedType, extraction, operationVin = null }) {
  if (sourceHint !== "FV" || !["FC", "REPOSICION"].includes(classifiedType)) {
    return { allowed: false, documentType: null, reason: "UNSUPPORTED_ROUTING_CONFLICT" };
  }

  if (!extraction || extraction.parse_error === true) {
    return { allowed: false, documentType: null, reason: "FV_CONTENT_EVIDENCE_UNAVAILABLE" };
  }

  const expectedVin = normalizeVin(operationVin);
  const extractedVin = normalizeVin(extraction.vin || extraction.vin_documento);
  if (expectedVin && extractedVin && extractedVin !== expectedVin) {
    return { allowed: false, documentType: null, reason: "FV_CONTENT_VIN_MISMATCH" };
  }

  const hasDealer = present(extraction.nombre_dealer) && present(extraction.rut_dealer);
  const hasCustomer = present(extraction.nombre_cliente)
    || present(extraction.nombre_facturado)
    || present(extraction.nombre_compra_para);
  const transactionEvidence = [
    extraction.folio_factura_venta,
    extraction.fecha_factura_venta,
    extraction.precio_venta_total,
  ].filter(present).length;

  if (!hasDealer || !hasCustomer || transactionEvidence < 2) {
    return { allowed: false, documentType: null, reason: "FV_CONTENT_EVIDENCE_INSUFFICIENT" };
  }

  return {
    allowed: true,
    documentType: "FV",
    reason: "FV_CONTENT_EVIDENCE_RESOLVES_CLASSIFIER_CONFLICT",
  };
}
