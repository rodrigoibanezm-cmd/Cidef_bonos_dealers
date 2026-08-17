import { getApprovalQueueKpis, listApprovedBonusRequestsByDealer, listDealers, listPendingBonusRequests } from "../../lib/approval_queue.js";
import styles from "./adminV2.module.css";

export const dynamic = "force-dynamic";

const URGENT_DAYS = 5;

function dateLabel(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function KPIBar({ kpis }) {
  const items = [
    ["◫", kpis.total_mes ?? 0, "Aprobadas mes"],
    ["▦", kpis.total_ano ?? 0, "Aprobadas año"],
    ["◷", kpis.total_pendientes ?? 0, "Pendientes"],
    ["!", kpis.total_urgentes ?? 0, "Urgentes"],
  ];
  return (
    <section className={styles.summary}>
      {items.map(([icon, value, label]) => (
        <div className={styles.summaryItem} key={label}>
          <span aria-hidden="true">{icon}</span>
          <div><strong>{value}</strong><small>{label}</small></div>
        </div>
      ))}
    </section>
  );
}

function DealerMenu({ dealers, selectedDealer }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}><strong>CIDEF</strong><span>Bonos Dealers</span></div>
      <div className={styles.sideTitle}>Dealers</div>
      <nav>
        {dealers.map((dealer) => (
          <a
            className={selectedDealer === dealer.dealer ? styles.activeDealer : ""}
            href={`/admin-v2?dealer=${encodeURIComponent(dealer.dealer)}`}
            key={dealer.dealer}
          >
            <span>{dealer.dealer}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function QueueTable({ rows, historical }) {
  if (!rows.length) {
    return <section className={styles.empty}><strong>Sin solicitudes</strong><span>No hay registros para mostrar.</span></section>;
  }
  return (
    <section className={styles.surface}>
      <table className={styles.table}>
        <thead><tr>
          <th>VIN</th><th>Marca / Modelo</th><th>Dealer</th><th>Ingreso</th><th>Días</th><th>Estado</th><th>Entrada</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => {
            const urgent = row.estado_cola === "URGENTE";
            return (
              <tr key={row.id}>
                <td><a className={styles.primary} href={`/admin-v2/request?id=${encodeURIComponent(row.id)}`}><strong>{row.vin || "-"}</strong></a></td>
                <td><span className={styles.vehicle}>{row.marca || "-"}<small>{row.modelo || "Modelo no disponible"}</small></span></td>
                <td>{row.tenant_id || "-"}</td>
                <td>{dateLabel(row.fecha_ingreso)}</td>
                <td><span className={urgent ? styles.red : ""}>{row.dias ?? 0}</span></td>
                <td><span className={`${styles.pill} ${urgent ? styles.pillRed : historical ? styles.pillGreen : styles.pillYellow}`}>{historical ? "APROBADA" : row.estado_cola}</span></td>
                <td><a className={styles.entry} href={`/admin-v2/request?id=${encodeURIComponent(row.id)}`}>Abrir <span>→</span></a></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function AdminV2Page({ searchParams }) {
  const params = await searchParams;
  const selectedDealer = String(params?.dealer || "").trim();
  const [kpis, dealers, rows] = await Promise.all([
    getApprovalQueueKpis({ urgentDays: URGENT_DAYS }),
    listDealers(),
    selectedDealer
      ? listApprovedBonusRequestsByDealer({ tenantId: selectedDealer })
      : listPendingBonusRequests({ urgentDays: URGENT_DAYS }),
  ]);

  return (
    <main className={styles.screen}>
      <DealerMenu dealers={dealers} selectedDealer={selectedDealer} />
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>CIDEF · BONOS DEALERS</span>
            <h1>{selectedDealer ? `Aprobadas · ${selectedDealer}` : "Solicitudes pendientes"}</h1>
          </div>
          {selectedDealer ? <a className={styles.back} href="/admin-v2">Volver a pendientes</a> : null}
        </header>
        <KPIBar kpis={kpis} />
        <QueueTable rows={rows} historical={Boolean(selectedDealer)} />
        <footer className={styles.footer}>{rows.length} solicitudes</footer>
      </div>
    </main>
  );
}
