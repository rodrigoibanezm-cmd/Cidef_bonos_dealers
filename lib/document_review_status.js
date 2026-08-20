export const REVIEW_STATUS = Object.freeze({
  OK: "OK",
  REQUIERE_CORRECCION: "REQUIERE_CORRECCION",
  FALTA: "FALTA",
  NO_APLICA: "NO_APLICA",
});

export function documentReviewStatus(row, { required = true } = {}) {
  if (!row) return required ? REVIEW_STATUS.FALTA : REVIEW_STATUS.NO_APLICA;

  if (row.parse_error === true) return REVIEW_STATUS.REQUIERE_CORRECCION;
  if (row.documento_valido === false) return REVIEW_STATUS.REQUIERE_CORRECCION;

  const status = String(row.status || "").trim().toUpperCase();
  if (status && !status.startsWith("OK")) return REVIEW_STATUS.REQUIERE_CORRECCION;

  return REVIEW_STATUS.OK;
}

export function documentCorrectionReason(row) {
  if (!row) return null;
  if (row.parse_error === true) return "PARSE_ERROR";
  if (row.documento_valido === false) return "INVALID_DOCUMENT";

  const status = String(row.status || "").trim().toUpperCase();
  return status && !status.startsWith("OK") ? status : null;
}
