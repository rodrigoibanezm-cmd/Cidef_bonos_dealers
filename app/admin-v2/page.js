import {
  getApprovalQueueKpis,
  listBonusRequestsByDealer,
  listDealers,
  listPendingBonusRequests,
} from "../../lib/approval_queue.js";
import TestCleanupButton from "./TestCleanupButton.js";
import styles from "./adminV2.module.css";

export const dynamic = "force-dynamic";
const URGENT_DAYS = 5;

function dateLabel(value) { if (!value) return "-"; return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }
function money(value) { if (value === null || value === undefined || value === "") return "-"; const number = Number(value); return Number.isFinite(number) ? `$ ${Math.trunc(number).toLocaleString("es-CL")}` : "-"; }
function dealerLabel(row) { return row.dealer_nombre || "Dealer no identificado"; }

function KPIBar({ kpis }) {
  const items = [["◫", kpis.total_mes ?? 0, "Aprobadas mes"],["▦", kpis.total_ano ?? 0, "Aprobadas año"],["◷", kpis.total_pendientes ?? 0, "Activas"],["!", kpis.total_urgentes ?? 0, "Urgentes"]];
  return <section className={styles.summary}>{items.map(([icon,value,label]) => <div className={styles.summaryItem} key={label}><span aria-hidden="true">{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>)}</section>;
}

function DealerMenu({ dealers, selectedDealer }) {
  return <aside className={styles.sidebar}><div className={styles.brand}><strong>CIDEF</strong><span>Bonos Dealers</span></div><a className={`${styles.activeQueue} ${!selectedDealer ? styles.activeDealer : ""}`} href="/admin-v2">Activos</a><div className={styles.sideTitle}>Dealers</div><nav className={styles.dealerList}>{dealers.map((dealer) => <a className={selectedDealer === dealer.dealer ? styles.activeDealer : ""} href={`/admin-v2?dealer=${encodeURIComponent(dealer.dealer)}`} key={dealer.dealer}>{dealer.dealer}</a>)}</nav></aside>;
}

function pendingReason(row) {
  if (row.estado === "PAGADA") return "Pagada: la OT ya salió del flujo activo.";
  if (row.estado === "APROBADA") return "Aprobada por CIDEF; pendiente de pago.";
  if (row.estado === "EN_REVISION") return "Revisión humana iniciada; faltan documentos o cierre final por aprobar.";
  if (row.requiere_revision_humana) return "Requiere revisión humana por una inconsistencia documental o económica.";
  if (row.cierre_estado === "VERDE") return "Auditoría automática conforme. Pendiente de revisión y aprobación humana de los documentos.";
  if (row.cierre_estado === "AMARILLO") return `Pendiente con observaciones: ${Array.isArray(row.inconsistencias) && row.inconsistencias.length ? row.inconsistencias.join(", ") : row.audit_status || "requiere revisión humana"}.`;
  if (row.cierre_estado === "ROJO") return `Bloqueada por auditoría: ${Array.isArray(row.inconsistencias) && row.inconsistencias.length ? row.inconsistencias.join(", ") : row.audit_status || "hay inconsistencias"}.`;
  return "Pendiente de cierre automático y revisión humana.";
}

function StatusPill({ row }) {
  const state = row.estado === "PAGADA" ? "PAGADA" : row.estado_cola;
  const cls = state === "URGENTE" || row.cierre_estado === "ROJO" ? styles.pillRed : row.requiere_revision_humana || row.cierre_estado === "AMARILLO" ? styles.pillYellow : row.cierre_estado === "VERDE" ? styles.pillGreen : styles.pillYellow;
  return <span className={`${styles.pill} ${cls}`} title={pendingReason(row)}>{state || "PENDIENTE"}</span>;
}

function SummaryTable({ rows }) {
  if (!rows.length) return <section className={styles.empty}><strong>Sin solicitudes</strong><span>No hay registros para mostrar.</span></section>;
  return <section className={styles.surface}><table className={styles.table}><thead><tr><th>VIN</th><th>Marca / Modelo</th><th>Dealer</th><th>Ingreso</th><th>Monto</th><th>Estado</th><th></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.vin || "-"}</strong></td><td><span className={styles.vehicle}>{row.marca || "-"}<small>{row.modelo || "Modelo no disponible"}</small></span></td><td>{dealerLabel(row)}</td><td>{dateLabel(row.fecha_ingreso)}</td><td><strong>{money(row.total_devolver)}</strong></td><td><StatusPill row={row} /></td><td><a className={styles.entry} href={`/admin-v2/request?id=${encodeURIComponent(row.id)}`}>Revisar →</a></td><td><TestCleanupButton requestId={String(row.id)} /></td></tr>)}</tbody></table></section>;
}

function ExtendedTable({ rows }) {
  if (!rows.length) return <section className={styles.empty}><strong>Sin solicitudes</strong><span>No hay registros para mostrar.</span></section>;
  return <section className={`${styles.surface} ${styles.extendedSurface}`}><table className={`${styles.table} ${styles.extendedTable}`}><thead><tr><th>Dealer</th><th>VIN</th><th>Marca</th><th>Modelo</th><th>Cliente</th><th>RUT</th><th>F. compra</th><th>Compra</th><th>F. venta</th><th>Venta</th><th>Días stock</th><th>PDV</th><th>FC</th><th>FV</th><th>INS</th><th>REPO</th><th>Carta</th><th>Bono dif.</th><th>Bono cierre</th><th>Bono fin.</th><th>Total</th><th>Cierre</th><th>Estado</th><th></th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{dealerLabel(row)}</td><td><strong>{row.vin || "-"}</strong></td><td>{row.marca || "-"}</td><td>{row.modelo || "-"}</td><td>{row.nombre_cliente || "-"}</td><td>{row.rut_cliente || "-"}</td><td>{dateLabel(row.fecha_compra)}</td><td>{money(row.monto_compra)}</td><td>{dateLabel(row.fecha_venta)}</td><td>{money(row.monto_venta)}</td><td>{row.dias_stock_dealer ?? "-"}</td><td>{row.pdv_ok || "-"}</td><td>{row.fac_compra_ok || "-"}</td><td>{row.fac_venta_ok || "-"}</td><td>{row.inscripcion_venta_ok || "-"}</td><td>{row.fac_reposicion_ok || "-"}</td><td>{row.carta_credito_ok || "-"}</td><td>{money(row.bono_dif)}</td><td>{money(row.bono_cierre)}</td><td>{money(row.bono_fin)}</td><td><strong>{money(row.total_devolver)}</strong></td><td>{row.cierre_estado || "-"}</td><td><StatusPill row={row} /></td><td><a className={styles.entry} href={`/admin-v2/request?id=${encodeURIComponent(row.id)}`}>Revisar →</a></td><td><TestCleanupButton requestId={String(row.id)} /></td></tr>)}</tbody></table></section>;
}

export default async function AdminV2Page({ searchParams }) {
  const params = await searchParams;
  const selectedDealer = String(params?.dealer || "").trim();
  const view = params?.view === "extended" ? "extended" : "summary";
  const [kpis, dealers, rows] = await Promise.all([getApprovalQueueKpis({ urgentDays: URGENT_DAYS }),listDealers(),selectedDealer ? listBonusRequestsByDealer({ dealer: selectedDealer, urgentDays: URGENT_DAYS }) : listPendingBonusRequests({ urgentDays: URGENT_DAYS })]);
  const baseHref = selectedDealer ? `/admin-v2?dealer=${encodeURIComponent(selectedDealer)}&` : "/admin-v2?";
  return <main className={styles.screen}><DealerMenu dealers={dealers} selectedDealer={selectedDealer} /><div className={styles.content}><header className={styles.header}><div><span className={styles.eyebrow}>CIDEF · BONOS DEALERS</span><h1>{selectedDealer ? selectedDealer : "Solicitudes activas"}</h1></div><TestCleanupButton deleteAll /></header><KPIBar kpis={kpis} /><div className={styles.viewBar}><span>Vista</span><a className={view === "summary" ? styles.viewActive : ""} href={`${baseHref}view=summary`}>Resumen</a><a className={view === "extended" ? styles.viewActive : ""} href={`${baseHref}view=extended`}>Tabla extendida</a></div>{view === "extended" ? <ExtendedTable rows={rows} /> : <SummaryTable rows={rows} />}<footer className={styles.footer}>{rows.length} solicitudes</footer></div></main>;
}
