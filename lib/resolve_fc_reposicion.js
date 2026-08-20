import { extractFcChassis, normalizeChassis } from "./extract_fc_chassis.js";

export async function resolveFcOrReposicion({ documentType, sourceVin, file }) {
  if (documentType !== "FC") {
    return { documentType, chassis: null, overridden: false };
  }

  const operationVin = normalizeChassis(sourceVin) || null;
  if (!operationVin) {
    return { documentType, chassis: null, overridden: false };
  }

  const chassis = await extractFcChassis({ file, comparisonVin: operationVin });
  const documentVin = normalizeChassis(chassis.vin) || null;

  if (!documentVin || chassis.readable !== true) {
    return { documentType, chassis, overridden: false };
  }

  if (documentVin !== operationVin) {
    return {
      documentType: "REPOSICION",
      chassis,
      overridden: true,
      reason: "DOCUMENT_VIN_DIFFERS_FROM_OPERATION_VIN",
    };
  }

  return {
    documentType: "FC",
    chassis,
    overridden: false,
    reason: "DOCUMENT_VIN_MATCHES_OPERATION_VIN",
  };
}
