import type { OrderReceiptPrintPayload } from "@/types/order";

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatReceiptDate(iso: string): string {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) {
        return iso;
    }
    return d.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short"
    });
}

function formatPesoReceipt(n: number): string {
    return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Builds a self-contained HTML document for print / Save as PDF (browser print dialog).
 * Light “stone receipt” look: paper tone, teal accent, high contrast for printing.
 */
export function buildOrderReceiptHtml(p: OrderReceiptPrintPayload): string {
    const accent = "#0d8fb8";
    const accentSoft = "#e6f6fb";
    const ink = "#0f172a";
    const muted = "#475569";
    const paper = "#faf9f6";
    const border = "#cbd5e1";

    const linesHtml = p.lines
        .map((line) => {
            const opts =
                line.optionLines.length > 0
                    ? `<div class="opts">${line.optionLines
                          .map((o) => `<div class="opt">${escapeHtml(o)}</div>`)
                          .join("")}</div>`
                    : "";
            return `
      <tr>
        <td class="td-main">
          <div class="title">${escapeHtml(line.title)}</div>
          ${opts}
        </td>
        <td class="td-num">${line.quantity}</td>
        <td class="td-num">${formatPesoReceipt(line.unitPricePeso)}</td>
        <td class="td-num td-strong">${formatPesoReceipt(line.lineTotalPeso)}</td>
      </tr>`;
        })
        .join("");

    const shipBlock =
        p.shipTo !== null
            ? `
    <section class="ship">
      <h2>Delivery details</h2>
      <p class="ship-name">${escapeHtml(p.shipTo.fullName)}</p>
      ${
          p.shipTo.email.trim()
              ? `<p class="ship-line">${escapeHtml(p.shipTo.email)}</p>`
              : ""
      }
      ${
          p.shipTo.contactNumber?.trim()
              ? `<p class="ship-line">${escapeHtml(p.shipTo.contactNumber)}</p>`
              : ""
      }
      <p class="ship-line">${escapeHtml(p.shipTo.addressLine)}</p>
      <p class="ship-line">${escapeHtml(p.shipTo.city)} ${escapeHtml(p.shipTo.postalCode)}${
          p.shipTo.country?.trim() ? `, ${escapeHtml(p.shipTo.country)}` : ""
      }</p>
      ${
          p.shipTo.deliveryNotes?.trim()
              ? `<p class="notes"><span class="lbl">Note to seller:</span> ${escapeHtml(
                    p.shipTo.deliveryNotes.trim()
                )}</p>`
              : ""
      }
    </section>`
            : "";

    const estBlock = p.estimatedDelivery
        ? `<p class="est"><span class="lbl">Estimated delivery:</span> ${escapeHtml(
              p.estimatedDelivery
          )}</p>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Receipt — ${escapeHtml(p.orderId)} — ${escapeHtml(p.appName)}</title>
  <style>
    @page { margin: 16mm; size: auto; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 20px 40px;
      font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: ${ink};
      background: ${paper};
    }
    .wrap { max-width: 640px; margin: 0 auto; }
    .mast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 3px solid ${accent};
      margin-bottom: 20px;
    }
    .brand { margin: 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; color: ${ink}; }
    .brand-logo { display: block; height: 48px; width: auto; max-width: 180px; object-fit: contain; }
    .tag { margin: 6px 0 0; font-size: 11px; color: ${muted}; max-width: 260px; }
    .badge {
      text-align: right;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${accent};
    }
    .receipt-label { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: ${muted}; }
    .order-id { margin: 4px 0 0; font-family: ui-monospace, monospace; font-size: 14px; font-weight: 600; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 24px;
      margin-bottom: 22px;
      font-size: 12px;
    }
    .meta-grid dt { margin: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${muted}; }
    .meta-grid dd { margin: 4px 0 0; font-weight: 600; }
    .est { margin: 0 0 18px; font-size: 12px; color: ${ink}; }
    .est .lbl { color: ${muted}; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th {
      text-align: left;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${muted};
      padding: 10px 8px;
      border-bottom: 1px solid ${border};
    }
    th:nth-child(n+2) { text-align: right; }
    td {
      vertical-align: top;
      padding: 14px 8px;
      border-bottom: 1px solid ${border};
    }
    .td-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .td-strong { font-weight: 700; color: ${accent}; }
    .title { font-weight: 700; font-size: 14px; }
    .opts { margin-top: 8px; }
    .opt { font-size: 11px; color: ${muted}; margin-top: 4px; padding-left: 10px; border-left: 2px solid ${accentSoft}; }
    .totals { margin-top: 16px; max-width: 280px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-size: 13px; }
    .totals-row.total { margin-top: 8px; padding-top: 12px; border-top: 2px solid ${ink}; font-size: 18px; font-weight: 800; color: ${accent}; }
    .ship {
      margin-top: 28px;
      padding: 16px 18px;
      background: #fff;
      border: 1px solid ${border};
      border-radius: 6px;
    }
    .ship h2 { margin: 0 0 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: ${muted}; }
    .ship-name { margin: 0; font-weight: 700; font-size: 15px; }
    .ship-line { margin: 6px 0 0; color: ${ink}; }
    .notes { margin: 12px 0 0; padding-top: 12px; border-top: 1px dashed ${border}; font-size: 12px; color: ${muted}; }
    .notes .lbl { font-weight: 700; color: ${ink}; }
    .footer {
      margin-top: 28px;
      padding: 14px 16px;
      background: ${accentSoft};
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.5;
      color: ${muted};
    }
    .fine { margin-top: 20px; font-size: 10px; color: ${muted}; text-align: center; }
    @media print {
      body { padding: 0; background: #fff; }
      .wrap { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="mast">
      <div>
        ${
            p.appLogoAbsoluteUrl
                ? `<img src="${escapeHtml(p.appLogoAbsoluteUrl)}" alt="${escapeHtml(p.appName)}" class="brand-logo" width="160" height="48"/>`
                : `<h1 class="brand">${escapeHtml(p.appName)}</h1>`
        }
        <p class="tag">Hand-finished stone from verified local sellers. This receipt is your record of purchase.</p>
      </div>
      <div class="badge">Order receipt</div>
    </header>

    <p class="receipt-label">Order number</p>
    <p class="order-id">${escapeHtml(p.orderId)}</p>

    <dl class="meta-grid">
      <div><dt>Placed</dt><dd>${escapeHtml(formatReceiptDate(p.orderPlacedAtIso))}</dd></div>
      <div><dt>Order status</dt><dd>${escapeHtml(p.orderStatusLabel)}</dd></div>
      <div><dt>Payment</dt><dd>${escapeHtml(p.paymentMethodLabel)}</dd></div>
      <div><dt>Payment status</dt><dd>${escapeHtml(p.paymentStatusLabel)}</dd></div>
    </dl>

    ${estBlock}

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Line</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${formatPesoReceipt(p.subtotalPeso)}</span></div>
      <div class="totals-row"><span>Shipping &amp; fees</span><span>${escapeHtml(p.shippingDisplay)}</span></div>
      <div class="totals-row total"><span>Total</span><span>${formatPesoReceipt(p.totalPeso)}</span></div>
    </div>

    ${shipBlock}

    <p class="footer">${escapeHtml(p.footerNote)}</p>
    <p class="fine">Questions? Contact your seller through ${escapeHtml(p.appName)} or support@mizaweb.app · Not a tax invoice unless issued separately by the seller.</p>
  </div>
</body>
</html>`;
}

/**
 * Opens a new window with the receipt, then triggers the print dialog (Print → Save as PDF).
 * @returns false if the popup was blocked.
 */
export function openOrderReceiptPrintWindow(payload: OrderReceiptPrintPayload): boolean {
    const html = buildOrderReceiptHtml(payload);
    const w = window.open("", "_blank", "noopener,noreferrer,width=760,height=920");
    if (!w) {
        return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    const triggerPrint = (): void => {
        try {
            w.focus();
            w.print();
        } catch {
            /* ignore */
        }
    };
    w.addEventListener("load", () => {
        window.setTimeout(triggerPrint, 200);
    });
    if (w.document.readyState === "complete") {
        window.setTimeout(triggerPrint, 200);
    }
    return true;
}
