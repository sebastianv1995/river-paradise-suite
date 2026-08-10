const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;',
}[char]));

const money = value => `$${Number(value).toFixed(2)}`;

function openTicket(title, body, targetWindow) {
  const popup = targetWindow || window.open('', '_blank', 'width=420,height=700');
  if (!popup) {
    window.alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.');
    return;
  }
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing:border-box; } body { width:72mm; margin:0 auto; color:#000; font:12px/1.35 Arial,sans-serif; }
    h1 { font-size:18px; text-align:center; margin:0 0 3px; } h2 { font-size:15px; margin:8px 0 4px; }
    .center { text-align:center; } .line { border-top:1px dashed #000; margin:7px 0; }
    table { width:100%; border-collapse:collapse; } td { padding:3px 0; vertical-align:top; } td:last-child { text-align:right; }
    .receipt-items { font-size:10px; table-layout:fixed; } .receipt-items thead { font-weight:bold; border-bottom:1px solid #000; }
    .receipt-items td:nth-child(1) { width:12%; } .receipt-items td:nth-child(2) { width:42%; padding-right:3px; }
    .receipt-items td:nth-child(3), .receipt-items td:nth-child(4) { width:23%; text-align:right; }
    .qty { width:28px; font-size:14px; font-weight:bold; } .total { font-size:16px; font-weight:bold; }
    .note { margin-top:12px; font-size:10px; text-align:center; }
  </style></head><body>${body}<script>window.onload=()=>{window.print();}</script></body></html>`);
  popup.document.close();
}

export function printKitchenTicket(mesa, location) {
  const rows = mesa.items.map(item => `<tr><td class="qty">${item.qty}</td><td>${escapeHtml(item.name)}</td></tr>`).join('');
  openTicket(`Comanda mesa ${mesa.number || mesa.id}`, `
    <h1>COMANDA DE COCINA</h1>
    <div class="center">${escapeHtml(location === 'cafeteria' ? 'Cafetería' : 'Restaurante')}</div>
    <div class="line"></div><h2>Mesa ${escapeHtml(mesa.number || mesa.id)}</h2>
    <div>${escapeHtml(new Date().toLocaleString('es-EC'))}</div><div class="line"></div>
    <table>${rows}</table><div class="line"></div><div class="note">Verifique cantidades antes de preparar.</div>`);
}

export function printSaleReceipt(sale, location, targetWindow) {
  const rows = (sale.items || []).map(item => `<tr><td class="qty">${item.qty}</td><td>${escapeHtml(item.name)}</td><td>${money(item.price)}</td><td>${money(item.price * item.qty)}</td></tr>`).join('');
  const method = sale.payment_method === 'cuenta' ? 'Cargado a cuenta' : (sale.payment_method || 'efectivo');
  openTicket(`Comprobante venta ${sale.id}`, `
    <h1>RIVER PARADISE</h1><div class="center">${escapeHtml(location === 'cafeteria' ? 'Cafetería' : 'Restaurante')}</div>
    <div class="center">COMPROBANTE DE CONSUMO</div><div class="line"></div>
    <div>Venta #${escapeHtml(sale.id)} &nbsp; ${sale.source === 'cuenta' ? `Habitación ${escapeHtml(sale.account_room || '-')}` : `Mesa ${escapeHtml(sale.mesa_numero || sale.mesa_id)}`}</div>
    <div>${escapeHtml(sale.fecha)} ${escapeHtml(sale.hora)}</div><div class="line"></div>
    <table class="receipt-items"><thead><tr><td>Cant.</td><td>Producto</td><td>P. unit.</td><td>Subtotal</td></tr></thead><tbody>${rows}</tbody></table><div class="line"></div>
    <table><tr class="total"><td>TOTAL</td><td>${money(sale.total)}</td></tr></table>
    <div>Pago: ${escapeHtml(method)}</div>${sale.payment_reference ? `<div>Referencia: ${escapeHtml(sale.payment_reference)}</div>` : ''}
    ${sale.invoice_requested ? `<div class="line"></div><div><b>DATOS PARA FACTURA</b></div>
      <div>Nombre: ${escapeHtml(sale.customer_name)}</div><div>RUC/Cédula: ${escapeHtml(sale.customer_tax_id)}</div>
      <div>Ciudad: ${escapeHtml(sale.customer_city)}</div>` : '<div class="line"></div><div><b>CLIENTE: CONSUMIDOR FINAL</b></div>'}
    <div class="line"></div><div class="note">Documento de respaldo / comprobante de consumo.<br>No es una factura electrónica autorizada por el SRI.</div>`, targetWindow);
}
