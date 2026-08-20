function normRut(value) {
  return String(value || "").toUpperCase().replace(/[^0-9K]/g, "") || null;
}

function normName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(SA|S A|SPA|SP A|LTDA|LIMITADA|EIRL)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function sameName(a, b) {
  const left = normName(a);
  const right = normName(b);
  return Boolean(left && right && left === right);
}

export function normalizeOperationIdentity({ fv, ins }) {
  const evidence = {
    ins: ins ? {
      extraction_id: ins.id ?? null,
      nombre_adquirente: ins.nombre_adquirente ?? null,
      rut_adquirente: ins.rut_adquirente ?? null,
    } : null,
    fv: fv ? {
      extraction_id: fv.id ?? null,
      nombre_facturado: fv.nombre_facturado ?? null,
      rut_facturado: fv.rut_facturado ?? null,
      nombre_compra_para: fv.nombre_compra_para ?? null,
      rut_compra_para: fv.rut_compra_para ?? null,
      nombre_cliente_legacy: fv.nombre_cliente ?? null,
      rut_cliente_legacy: fv.rut_cliente ?? null,
    } : null,
  };

  if (!fv) return { status: "UNRESOLVED", reason: "FV_MISSING", evidence };

  const insRut = normRut(ins?.rut_adquirente);
  const insName = ins?.nombre_adquirente ?? null;
  const candidates = [
    { role: "COMPRA_PARA", nombre: fv.nombre_compra_para, rut: fv.rut_compra_para },
    { role: "FACTURADO_A", nombre: fv.nombre_facturado, rut: fv.rut_facturado },
    { role: "LEGACY_CLIENTE", nombre: fv.nombre_cliente, rut: fv.rut_cliente },
  ].filter((candidate) => candidate.nombre || candidate.rut);

  if (insRut) {
    const rutMatch = candidates.find((candidate) => normRut(candidate.rut) === insRut);
    if (rutMatch) {
      return {
        status: "RESOLVED",
        method: `INS_RUT_MATCH_${rutMatch.role}`,
        nombre_cliente: insName || rutMatch.nombre || null,
        rut_cliente: ins.rut_adquirente,
        role: rutMatch.role,
        evidence,
      };
    }
  }

  if (insName) {
    const nameMatch = candidates.find((candidate) => sameName(candidate.nombre, insName));
    if (nameMatch) {
      const candidateRut = normRut(nameMatch.rut);
      if (!insRut || !candidateRut || insRut === candidateRut) {
        return {
          status: "RESOLVED",
          method: `INS_NAME_MATCH_${nameMatch.role}`,
          nombre_cliente: insName,
          rut_cliente: ins?.rut_adquirente || nameMatch.rut || null,
          role: nameMatch.role,
          evidence,
        };
      }
      return { status: "UNRESOLVED", reason: "NAME_MATCH_RUT_CONFLICT", role: nameMatch.role, evidence };
    }
  }

  const preferred = candidates.find((candidate) => candidate.role === "COMPRA_PARA")
    || candidates.find((candidate) => candidate.role === "FACTURADO_A")
    || candidates[0];
  return {
    status: ins ? "UNRESOLVED" : "PROVISIONAL",
    reason: ins ? "INS_IDENTITY_NOT_FOUND_IN_FV" : "INS_MISSING",
    nombre_cliente: preferred?.nombre ?? null,
    rut_cliente: preferred?.rut ?? null,
    role: preferred?.role ?? null,
    evidence,
  };
}
