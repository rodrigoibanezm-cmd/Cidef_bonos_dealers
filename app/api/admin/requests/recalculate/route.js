import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db.js";
import { calculateBonusRequest } from "../../../../../motors/calculate_bonus_request.js";

export const runtime = "nodejs";

const CALCULATION_ISSUES = new Set(["CALCULATION_REQUIRES_REVIEW","PDV_PENDING","TOTAL_DEVOLVER_PENDING","FECHA_VENTA_REQUIRED"]);
function asList(value){if(Array.isArray(value))return value;if(!value)return[];try{const parsed=typeof value==="string"?JSON.parse(value):value;return Array.isArray(parsed)?parsed:[];}catch{return[];}}
function isCalculationIssue(code){return CALCULATION_ISSUES.has(code)||String(code||"").startsWith("PRICE_LOOKUP_");}
function optionalNonNegative(value,name){if(value===null||value===undefined||value==="")return null;const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error(`${name} must be a non-negative number`);return n;}

export async function POST(request){
  try{
    const body=await request.json(); const requestId=String(body?.request_id||"").trim(); if(!requestId)return NextResponse.json({ok:false,error:"request_id is required"},{status:400});
    const descuentoDealer=optionalNonNegative(body?.descuento_dealer,"descuento_dealer");
    const precioLista=optionalNonNegative(body?.precio_lista_venta,"precio_lista_venta");
    const bonoCidef=optionalNonNegative(body?.bono_cidef,"bono_cidef");
    const bonoFin=optionalNonNegative(body?.bono_fin_venta,"bono_fin_venta");
    const bonoCierre=optionalNonNegative(body?.bono_cierre_venta,"bono_cierre_venta");
    const sql=db(); const rows=await sql`select * from bonus_requests where id=${requestId} limit 1`; const current=rows[0]; if(!current)return NextResponse.json({ok:false,error:"bonus request not found"},{status:404});
    const issues=asList(current.inconsistencias); const nonCalculationIssues=issues.filter((code)=>!isCalculationIssue(code)); const missingDocuments=asList(current.documentos_faltantes);
    if(!nonCalculationIssues.length&&!missingDocuments.length)await sql`update bonus_requests set requiere_revision_humana=false,updated_at=now() where id=${requestId}`;
    const result=await calculateBonusRequest({requestId,descuentosDealerEvidence:descuentoDealer,precioListaOverride:precioLista,bonoCidefOverride:bonoCidef,bonoFinOverride:bonoFin,bonoCierreListaOverride:bonoCierre});
    await sql`insert into bonus_request_events(request_id,action,actor_user_id,actor_tenant_id,metadata) values(${requestId},'CALCULO_MANUAL_RECALCULADO','REVIEW_PENDING_SIGNATURE','CIDEF',${JSON.stringify({descuento_dealer:descuentoDealer,precio_lista_venta:precioLista,bono_cidef:bonoCidef,bono_fin_venta:bonoFin,bono_cierre_venta:bonoCierre,calculation_status:result?.calculation_status??result?.status??null})}::jsonb)`;
    return NextResponse.json({ok:true,result});
  }catch(error){console.error("[BONUS_MANUAL_RECALCULATE]",error);return NextResponse.json({ok:false,error:error?.message||"recalculation failed"},{status:400});}
}
