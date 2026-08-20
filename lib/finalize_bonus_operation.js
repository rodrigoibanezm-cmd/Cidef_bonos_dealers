import { consolidateBonusOperations } from "../motors/consolidate_bonus_operations.js";
import { calculateBonusRequest } from "../motors/calculate_bonus_request.js";

export async function finalizeBonusOperation({ tenantId, vin }) {
  if (!tenantId || !vin) return { consolidated: null, calculated: [] };

  const consolidated = await consolidateBonusOperations({ tenantId, vin });
  const calculated = [];

  for (const operation of consolidated.operations || []) {
    calculated.push(await calculateBonusRequest({ requestId: operation.id }));
  }

  return { consolidated, calculated };
}
