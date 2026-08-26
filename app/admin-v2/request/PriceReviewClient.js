"use client";

import { useEffect, useMemo, useState } from "react";
import RecalculatePriceClient from "./RecalculatePriceClient.js";
import styles from "./review.module.css";

const PRICE_FIELDS = [
  ["lista_precio_utilizada", "Lista de precios utilizada", "text"],
  ["price_version_id", "Versión precio", "text"],
  ["precio_lista_venta", "Precio lista venta", "money"],
  ["bono_cidef", "Bono CIDEF lista", "money"],
  ["bono_cierre_venta", "Bono cierre lista", "money"],
  ["bono_fin_venta", "Bono financiamiento lista", "money"],
  ["descuentos_dealer", "Descuento dealer aprobado", "money"],
  ["pdv_ok", "PDV", "text"],
  ["bono_dif", "Diferencia precio calculada", "money"],
  ["bono_cierre", "Bono cierre a pagar", "money"],
  ["bono_fin", "Bono financiamiento a pagar", "money"],
  ["total_devolver", "Total devolución", "money"],
];

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? `$ ${Math.trunc(number).toLocaleString("es-CL")}` : "-";
}

function display(value, kind) {
  if (kind === "money") return money(value);
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function XlsViewport({ requestId, filename }) {
  const [frameUrl, setFrameUrl] = useState("");
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const source = `${window.location.origin}/api/admin/price-list-file?request_id=${encodeURIComponent(requestId)}`;
    setFrameUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(source)}`);
  }, [requestId]);

  useEffect(() => {
    if (!hovered) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [hovered]);

  const originalUrl = useMemo(() => `/api/admin/price-list-file?request_id=${encodeURIComponent(requestId)}`, [requestId]);

  return <>
    <div className={styles.xlsViewport} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {frameUrl ? <iframe className={styles.xlsFrame} src={frameUrl} title={`Lista de precios ${filename || ""}`} /> : <div className={styles.noFile}>Cargando lista de precios...</div>}
    </div>
    <div className={styles.originalAction}><a href={originalUrl} target="_blank" rel="noreferrer">Abrir XLS original</a></div>
  </>;
}

export default function PriceReviewClient({ request }) {
  const summaryHref = `/admin-v2/request?id=${encodeURIComponent(request.id)}&stage=summary`;

  return <>
    <div className={styles.documentHeader}>
      <div><strong>PRECIOS · Paso final de validación</strong><span>{request.lista_precio_utilizada || "Lista de precios no identificada"}</span></div>
      <span className={styles.pending}>VALIDAR</span>
    </div>
    <section className={styles.grid}>
      <div className={styles.visualPanel}>
        <div className={styles.panelTitle}>Lista de precios original</div>
        {request.lista_precio_utilizada ? <XlsViewport requestId={request.id} filename={request.lista_precio_utilizada} /> : <div className={styles.noFile}>No existe una lista de precios vinculada al cálculo.</div>}
      </div>
      <div className={styles.dataPanel}>
        <div className={styles.panelTitle}>Campos a validar</div>
        <div className={styles.fields}>
          {PRICE_FIELDS.map(([key, label, kind]) => <div className={styles.fieldRow} key={key}>
            <div className={styles.fieldText}><small>{label}</small><strong>{display(request[key], kind)}</strong></div>
          </div>)}
        </div>
        <RecalculatePriceClient requestId={request.id} currentDiscount={request.descuentos_dealer} />
        <a className={styles.continueButton} href={summaryHref}>Validar precios y ver consolidado →</a>
      </div>
    </section>
  </>;
}
