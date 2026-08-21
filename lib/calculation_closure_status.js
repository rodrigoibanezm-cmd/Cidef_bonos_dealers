import { persistOperationClosure } from "./persist_operation_closure.js";

const CALCULATION_ISSUE_CODES = new Set([
  "CALCULATION_REQUIRES_REVIEW",
  "PDV_PENDING",
  "TOTAL_DEVOLVER_PENDING",
  "FECHA_VENTA_REQUIRED",
]);

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function isCalculationIssue(code) {
  return CALCULATION_ISSUE_CODES.has(code) || String(code || "").startsWith("PRICE_LOOKUP_");
}

export function closureBlocksCalculation(request) {
  const state = String(request?.cierre_estado || "").toUpperCase();
  if (!state || state === "VERDE") return false;
  if (state === "ROJO") return true;
  const issues = asList(request?.inconsistencias);
  if (asList(request?.documentos_faltantes).length) return true;
  // An amber state is recalculable only when its complete explanation is a
  // prior calculation issue that this invocation can resolve.
  return !issues.length || issues.some((code) => !isCalculationIssue(code));
}

export function calculationIssueCodes(calculation) {
  const issues = [];
  const lookupStatus = String(calculation?.price_lookup_status || "").toUpperCase();
  if (lookupStatus && lookupStatus !== "OK") issues.push(`PRICE_LOOKUP_${lookupStatus}`);
  if (calculation?.reason === "FECHA_VENTA_REQUIRED") issues.push("FECHA_VENTA_REQUIRED");
  if (calculation?.calculation_status === "REQUIERE_REVISION") issues.push("CALCULATION_REQUIRES_REVIEW");
  if (String(calculation?.pdv_ok || "").toUpperCase() !== "OK") issues.push("PDV_PENDING");
  if (calculation?.total_devolver === null || calculation?.total_devolver === undefined) {
    issues.push("TOTAL_DEVOLVER_PENDING");
  }
  return unique(issues);
}

export function buildCurrentCalculationClosure({ request, calculation }) {
  const existing = asList(request?.inconsistencias);
  const nonCalculationIssues = existing.filter((code) => !isCalculationIssue(code));
  const activeCalculationIssues = calculationIssueCodes(calculation);
  const inconsistencias = unique([...nonCalculationIssues, ...activeCalculationIssues]);
  const currentState = String(request?.cierre_estado || "").toUpperCase();
  const hasActiveCalculationIssue = activeCalculationIssues.length > 0;
  const cierreEstado = currentState === "ROJO"
    ? "ROJO"
    : hasActiveCalculationIssue || nonCalculationIssues.length
      ? "AMARILLO"
      : "VERDE";

  const requiresReview = cierreEstado !== "VERDE";
  return {
    vin: request?.vin ?? null,
    cierre_estado: cierreEstado,
    requiere_revision_humana: requiresReview,
    audit_status: requiresReview ? "REQUIERE_REVISION_HUMANA" : "RESUELTO_AUTOMATICAMENTE",
    document_statuses: {
      fv: request?.fv_status ?? null,
      fc: request?.fc_status ?? null,
      ins: request?.inscripcion_status ?? null,
      fin: request?.financiamiento_status ?? null,
      repo: request?.reposicion_status ?? null,
    },
    documentos_faltantes: asList(request?.documentos_faltantes),
    inconsistencias,
    exhausted_issues: [],
    issues: inconsistencias.map((code) => ({
      code,
      kind: isCalculationIssue(code) ? "CALCULATION" : "CURRENT_OPERATION",
      document_type: null,
      context: {},
    })),
    identity: null,
    evidence: {
      calculation_status: calculation?.calculation_status ?? null,
      pdv_ok: calculation?.pdv_ok ?? null,
      total_devolver: calculation?.total_devolver ?? null,
      price_lookup_status: calculation?.price_lookup_status ?? null,
      reason: calculation?.reason ?? null,
    },
  };
}

export async function persistCurrentCalculationClosure({
  request,
  calculation,
  sql,
  persistClosure = persistOperationClosure,
}) {
  const closure = buildCurrentCalculationClosure({ request, calculation });
  await sql`
    update bonus_requests set
      tiene_inconsistencias=${closure.inconsistencias.length > 0},
      inconsistencias=${JSON.stringify(closure.inconsistencias)}::jsonb,
      cierre_estado=${closure.cierre_estado},
      requiere_revision_humana=${closure.requiere_revision_humana},
      audit_status=${closure.audit_status},
      updated_at=now()
    where id=${request.id}
  `;
  await persistClosure({
    tenantId: request.tenant_id,
    vin: request.vin,
    phase: "FINAL",
    closure,
    sql,
  });
  return closure;
}
