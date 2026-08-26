import { NextResponse } from "next/server";
import { db } from "../../../../lib/db.js";

export const runtime = "nodejs";

function actionFor(row) {
  if (row.documentacion_estado === "COMPLETA") return null;
  if (row.fc_status !== "OK") return { label: "Subir factura compra", document_type: "FC" };
  if (row.fv_status !== "OK") return { label: "Subir factura venta", document_type: "FV" };
  if (row.inscripcion_status !== "OK") return { label: "Subir inscripción", document_type: "INSCRIP" };
  if (row.financiado_forum === true && row.financiamiento_status !== "OK") {
    return { label: "Subir carta financiamiento", document_type: "CARTA_FINANCIAMIENTO" };
  }
  return null;
}

function statusFor(row) {
  if (row.estado === "APROBADA") return "APROBADO";
  if (row.documentacion_estado === "COMPLETA") return "EN_REVISION";
  if (actionFor(row)) return "FALTA_DOCUMENTO";
  return "PROCESANDO";
}

export async function GET() {
  try {
    const tenantId = process.env.DEFAULT_TENANT_ID || "dealer_demo";
    const sql = db();
    const rows = await sql`
      select
        r.id,
        r.vin,
        r.estado,
        r.created_at,
        r.submitted_at,
        r.approved_at,
        r.financiado_forum,
        r.documentacion_estado,
        r.fc_status,
        r.fv_status,
        r.inscripcion_status,
        r.financiamiento_status,
        r.total_devolver
      from bonus_requests r
      where r.tenant_id = ${tenantId}
      order by coalesce(r.submitted_at, r.created_at) desc
      limit 250
    `;

    const operations = rows.map((row) => {
      const action = actionFor(row);
      const baseDate = row.submitted_at || row.created_at;
      const days = baseDate
        ? Math.max(0, Math.floor((Date.now() - new Date(baseDate).getTime()) / 86400000))
        : 0;

      return {
        id: row.id,
        vin: row.vin,
        status: statusFor(row),
        amount: row.total_devolver,
        days_sent: days,
        action,
      };
    });

    return NextResponse.json({ ok: true, tenant_id: tenantId, operations });
  } catch (error) {
    console.error("Dealer operations failed", error);
    return NextResponse.json({ ok: false, error: error?.message || "Dealer operations failed" }, { status: 500 });
  }
}
