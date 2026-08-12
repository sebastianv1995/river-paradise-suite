const express = require('express');
const cors    = require('cors');
const ExcelJS = require('exceljs');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const os      = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const app     = express();
const PORT    = Number(process.env.PORT) || 3001;
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'river_paradise.json');
const DB_SEED_FILE = path.join(__dirname, 'river_paradise.seed.json');
const MENU_FILE = path.join(__dirname, '..', 'menu.json');
const LOCATIONS = ['restaurante', 'cafeteria'];
const EXCEL_PROTECTION_PASSWORD = process.env.EXCEL_PROTECTION_PASSWORD || crypto.randomBytes(24).toString('hex');
const liveClients = new Set();
const execFileAsync = promisify(execFile);
const KITCHEN_PRINTER = process.env.KITCHEN_PRINTER || 'SAT 22TUS';
const PRINT_SCRIPT = path.join(__dirname, 'print-ticket.ps1');
const RECEIPT_PRINT_SCRIPT = path.join(__dirname, 'print-receipt.ps1');

// ── Base de datos JSON ────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    if (fs.existsSync(DB_SEED_FILE)) {
      const seeded = JSON.parse(fs.readFileSync(DB_SEED_FILE, 'utf8'));
      fs.writeFileSync(DB_FILE, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const initial = {
      mesas:   Array.from({ length: 12 }, (_, i) => ({ id: i+1, status: 'libre', openedAt: null, items: [] })),
      ventas:  [],
      cierres: [],
      _nextVentaId:  1,
      _nextCierreId: 1,
      movimientos_stock: [],
      _nextStockMovementId: 1,
      movimientos_caja: [],
      _nextCashMovementId: 1,
      cuentas: [],
      _nextAccountId: 1,
      _nextAccountChargeId: 1,
      _nextAccountPaymentId: 1,
      _nextAccountWriteoffId: 1,
      print_jobs: [],
      _nextPrintJobId: 1,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.movimientos_stock ||= [];
  db._nextStockMovementId ||= 1;
  db.movimientos_caja ||= [];
  db._nextCashMovementId ||= 1;
  db.cuentas ||= [];
  db._nextAccountId ||= 1;
  db._nextAccountChargeId ||= 1;
  db._nextAccountPaymentId ||= 1;
  db._nextAccountWriteoffId ||= 1;
  db.print_jobs ||= [];
  db._nextPrintJobId ||= 1;
  for (const mesa of db.mesas) {
    mesa.location_id ||= 'restaurante';
    mesa.number ||= mesa.id;
  }
  if (!db.mesas.some(mesa => mesa.location_id === 'cafeteria')) {
    const nextId = Math.max(0, ...db.mesas.map(mesa => mesa.id)) + 1;
    db.mesas.push(...Array.from({ length:12 }, (_, index) => ({
      id:nextId + index, number:index + 1, location_id:'cafeteria', status:'libre', openedAt:null, items:[],
    })));
  }
  for (const sale of db.ventas) sale.location_id ||= 'restaurante';
  for (const closing of db.cierres) closing.location_id ||= 'restaurante';
  for (const movement of db.movimientos_caja) movement.location_id ||= 'restaurante';
  for (const account of db.cuentas) {
    account.stay_id ||= `stay-${account.id}`;
    if (account.reservation_id === undefined) account.reservation_id = null;
    for (const charge of account.charges || []) charge.location_id ||= 'restaurante';
    for (const payment of account.payments || []) payment.location_id ||= 'restaurante';
    for (const writeoff of account.writeoffs || []) writeoff.location_id ||= 'restaurante';
  }
  return db;
}

function saveDB(db) {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
  fs.renameSync(tempFile, DB_FILE);
}

function loadMenu() {
  return JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
}

function saveMenu(menu) {
  const tempFile = `${MENU_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(menu, null, 2));
  fs.renameSync(tempFile, MENU_FILE);
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin(origin, callback) {
  const allowed = !origin || /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5173$/.test(origin);
  callback(allowed ? null : new Error('Origen no permitido'), allowed);
} }));
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });
const nowTime  = () => new Date().toLocaleTimeString('es-EC', { hour:'2-digit', minute:'2-digit' });
const fmt      = n  => Math.round(n * 100) / 100;
const mesaTotal= m  => m.items.reduce((s, i) => s + i.price * i.qty, 0);
const findMesa = (db, id) => db.mesas.find(m => m.id === Number(id));
const sendMesa = (res, mesa) => res.json({ ...mesa, total: fmt(mesaTotal(mesa)) });

function requireMesa(db, id, res) {
  const mesa = findMesa(db, id);
  if (!mesa) res.status(404).json({ error: 'Mesa no encontrada' });
  return mesa;
}

function stockFor(db, itemId) {
  return db.movimientos_stock
    .filter(m => m.item_id === itemId)
    .reduce((total, movement) => total + movement.quantity, 0);
}

function accountSummary(account, ventas = []) {
  const charged = fmt((account.charges || []).reduce((sum, item) => sum + item.amount, 0));
  const paid = fmt((account.payments || []).reduce((sum, item) => sum + item.amount, 0));
  const internal = fmt((account.writeoffs || []).reduce((sum, item) => sum + item.amount, 0));
  const salesById = Object.fromEntries(ventas.map(sale => [sale.id, sale]));
  const charges = (account.charges || []).map(charge => ({
    ...charge, items:charge.items || salesById[charge.sale_id]?.items || [],
  }));
  return { ...account, charges, charged, paid, internal, balance:fmt(charged - paid - internal) };
}

function validLocation(value) {
  return LOCATIONS.includes(value) ? value : null;
}

function broadcastLive(event) {
  const payload = `data: ${JSON.stringify({ ...event, at:Date.now() })}\n\n`;
  for (const client of liveClients) client.write(payload);
}

function broadcastMesaChange(mesa) {
  broadcastLive({ type:'mesas', location_id:mesa.location_id });
}

function kitchenTicketData(mesa) {
  return {
    title:'COMANDA DE COCINA',
    location:mesa.location_id === 'cafeteria' ? 'Cafetería' : 'Restaurante',
    table:`Mesa ${mesa.number || mesa.id}`,
    date:new Date().toLocaleString('es-EC'),
    items:mesa.items.map(item => ({ quantity:item.qty, name:item.name })),
    footer:'Verifique cantidades antes de preparar.',
  };
}

async function printKitchenTicket(mesa) {
  const ticketPath = path.join(os.tmpdir(), `river-kitchen-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
  await fs.promises.writeFile(ticketPath, JSON.stringify(kitchenTicketData(mesa)), 'utf8');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PRINT_SCRIPT,
      '-TicketPath', ticketPath, '-PrinterName', KITCHEN_PRINTER], { windowsHide:true, timeout:20000 });
  } finally {
    await fs.promises.unlink(ticketPath).catch(() => {});
  }
}

function receiptTicketData(sale) {
  return {
    title:'RIVER PARADISE', subtitle:'COMPROBANTE DE CONSUMO',
    location:sale.location_id === 'cafeteria' ? 'Cafetería' : 'Restaurante',
    reference:`Venta #${sale.id} · ${sale.source === 'cuenta' ? `Habitación ${sale.account_room || '-'}` : `Mesa ${sale.mesa_numero || sale.mesa_id}`}`,
    date:`${sale.fecha} ${sale.hora}`,
    items:(sale.items || []).map(item => ({ quantity:item.qty, name:item.name, unit_price:item.price, subtotal:fmt(item.price * item.qty) })),
    total:sale.total,
    payment:sale.payment_method === 'cuenta' ? 'Cargado a cuenta' : sale.payment_method,
    payment_reference:sale.payment_reference || '',
    invoice_requested:sale.invoice_requested === true,
    customer_name:sale.customer_name || 'CONSUMIDOR FINAL',
    customer_tax_id:sale.customer_tax_id || '', customer_city:sale.customer_city || '',
  };
}

async function printCustomerReceipt(sale) {
  const receiptPath = path.join(os.tmpdir(), `river-receipt-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
  await fs.promises.writeFile(receiptPath, JSON.stringify(receiptTicketData(sale)), 'utf8');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RECEIPT_PRINT_SCRIPT,
      '-TicketPath', receiptPath, '-PrinterName', KITCHEN_PRINTER], { windowsHide:true, timeout:20000 });
  } finally {
    await fs.promises.unlink(receiptPath).catch(() => {});
  }
}

async function polishWorkbook(workbook, summarySheets = []) {
  workbook.creator = 'River Paradise';
  workbook.company = 'River Paradise';
  workbook.subject = 'Reporte administrativo';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const summaries = new Set(summarySheets);
  for (const sheet of workbook.worksheets) {
    const isSummary = summaries.has(sheet.name);
    const lastColumn = Math.max(1, sheet.columnCount);
    const lastColumnLetter = sheet.getColumn(lastColumn).letter;
    sheet.properties.defaultRowHeight = 18;
    sheet.pageSetup = {
      orientation:lastColumn > 5 ? 'landscape' : 'portrait', paperSize:9,
      fitToPage:true, fitToWidth:1, fitToHeight:0,
      margins:{ left:0.3, right:0.3, top:0.55, bottom:0.55, header:0.2, footer:0.2 },
    };
    sheet.headerFooter.oddFooter = '&LRiver Paradise&CConfidencial&R Página &P de &N';
    sheet.getRow(1).height = isSummary ? 28 : 24;
    sheet.getRow(1).alignment = { vertical:'middle', horizontal:isSummary ? 'left' : 'center' };
    sheet.getRow(1).font = { bold:true, size:isSummary ? 14 : 11, color:{ argb:'FFFFFFFF' } };
    sheet.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF235347' } };
    if (!isSummary && sheet.rowCount >= 1) {
      sheet.views = [{ state:'frozen', ySplit:1, showGridLines:false }];
      sheet.autoFilter = `A1:${lastColumnLetter}${Math.max(1, sheet.rowCount)}`;
    } else {
      sheet.views = [{ showGridLines:false }];
    }
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty:true }, cell => {
        cell.alignment = { ...cell.alignment, vertical:'middle', wrapText:true };
        if (rowNumber > 1 && !isSummary && rowNumber % 2 === 0) {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF5F7F6' } };
        }
        if (rowNumber > 1) cell.border = { bottom:{ style:'hair', color:{ argb:'FFD9E1DE' } } };
      });
    });
    if (isSummary) {
      sheet.getColumn(1).font = { bold:true, color:{ argb:'FF29453D' } };
      sheet.getColumn(2).alignment = { horizontal:'right', vertical:'middle' };
    }
    await sheet.protect(EXCEL_PROTECTION_PASSWORD, {
      spinCount:10000,
      selectLockedCells:true,
      selectUnlockedCells:true,
      autoFilter:true,
      sort:true,
      formatCells:false,
      formatColumns:false,
      formatRows:false,
      insertRows:false,
      insertColumns:false,
      deleteRows:false,
      deleteColumns:false,
    });
  }
}

// ── CARTA ─────────────────────────────────────────────────────

app.get('/api/menu', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const menu = loadMenu();
  const publicMenu = Object.fromEntries(Object.entries(menu)
    .map(([category, items]) => [category, items.filter(item => item.inventory_only !== true)])
    .filter(([, items]) => items.length > 0));
  res.json(publicMenu);
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type:'connected', at:Date.now() })}\n\n`);
  liveClients.add(res);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); liveClients.delete(res); });
});

app.post('/api/menu', (req, res) => {
  const menu = loadMenu();
  const category = String(req.body.category ?? '').trim();
  const name = String(req.body.name ?? '').trim();
  const desc = String(req.body.desc ?? '').trim();
  const price = Number(req.body.price);
  const trackStock = req.body.track_stock === true;
  const stockMin = Number(req.body.stock_min ?? 0);

  if (!category || category.length > 80) return res.status(400).json({ error:'Escribe una categoría válida' });
  if (!name || name.length > 100) return res.status(400).json({ error:'Escribe un nombre válido' });
  if (desc.length > 300) return res.status(400).json({ error:'La descripción es demasiado larga' });
  if (!Number.isFinite(price) || price < 0 || price > 9999.99) return res.status(400).json({ error:'El precio debe estar entre 0 y 9999.99' });
  if (trackStock && (!Number.isInteger(stockMin) || stockMin < 0 || stockMin > 100000)) {
    return res.status(400).json({ error:'El stock mínimo debe ser un entero mayor o igual a cero' });
  }

  const ids = new Set(Object.values(menu).flat().map(item => item.id));
  let id;
  do id = `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; while (ids.has(id));
  const product = { id, name, desc, price:fmt(price) };
  if (trackStock) Object.assign(product, { track_stock:true, stock_min:stockMin });
  menu[category] ||= [];
  menu[category].push(product);
  saveMenu(menu);
  broadcastLive({ type:'menu' });
  res.status(201).json({ product, menu });
});

app.put('/api/menu/:itemId', (req, res) => {
  const menu = loadMenu();
  const name = String(req.body.name ?? '').trim();
  const desc = String(req.body.desc ?? '').trim();
  const price = Number(req.body.price);

  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!Number.isFinite(price) || price < 0 || price > 9999.99) {
    return res.status(400).json({ error: 'El precio debe ser un número entre 0 y 9999.99' });
  }
  if (name.length > 100 || desc.length > 300) {
    return res.status(400).json({ error: 'El nombre o la descripción son demasiado largos' });
  }

  let product;
  for (const items of Object.values(menu)) {
    product = items.find(item => item.id === req.params.itemId);
    if (product) break;
  }
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  product.name = name;
  product.desc = desc;
  product.price = fmt(price);
  if (req.body.track_stock === true) {
    const stockMin = Number(req.body.stock_min ?? 0);
    if (!Number.isInteger(stockMin) || stockMin < 0 || stockMin > 100000) {
      return res.status(400).json({ error:'El stock mínimo debe ser un entero mayor o igual a cero' });
    }
    product.track_stock = true;
    product.stock_min = stockMin;
  } else {
    delete product.track_stock;
    delete product.stock_min;
  }
  saveMenu(menu);
  broadcastLive({ type:'menu' });
  res.json(product);
});

// ── INVENTARIO ────────────────────────────────────────────────

app.get('/api/inventory', (req, res) => {
  const db = loadDB();
  const products = Object.values(loadMenu()).flat().filter(item => item.track_stock);
  res.json(products.map(product => {
    const movements = db.movimientos_stock.filter(m => m.item_id === product.id);
    return {
      ...product,
      received: movements.filter(m => m.type === 'entrada').reduce((sum, m) => sum + m.quantity, 0),
      sold: -movements.filter(m => m.type === 'venta').reduce((sum, m) => sum + m.quantity, 0),
      stock: movements.reduce((sum, m) => sum + m.quantity, 0),
    };
  }));
});

app.get('/api/inventory/movements', (req, res) => {
  const db = loadDB();
  const products = Object.fromEntries(Object.values(loadMenu()).flat().map(item => [item.id, item]));
  res.json([...db.movimientos_stock].reverse().map(movement => ({
    ...movement, product_name: products[movement.item_id]?.name || movement.item_id,
  })));
});

app.post('/api/inventory/:itemId/entries', (req, res) => {
  const db = loadDB();
  const product = Object.values(loadMenu()).flat().find(item => item.id === req.params.itemId && item.track_stock);
  const enteredQuantity = Number(req.body.quantity);
  if (!product) return res.status(404).json({ error: 'Producto de inventario no encontrado' });
  if (!Number.isInteger(enteredQuantity) || enteredQuantity <= 0 || enteredQuantity > 100000) {
    return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a cero' });
  }
  const packageSize = Number.isInteger(product.package_size) && product.package_size > 1 ? product.package_size : 1;
  const quantity = enteredQuantity * packageSize;
  db.movimientos_stock.push({
    id: db._nextStockMovementId++, item_id: product.id, type: 'entrada', quantity,
    note: packageSize > 1 ? `${enteredQuantity} caja(s) de ${packageSize} unidades` : '',
    date: new Date().toISOString(),
  });
  saveDB(db);
  broadcastLive({ type:'inventory', item_id:product.id });
  res.json({ ok:true, stock:stockFor(db, product.id), units_added:quantity });
});

app.post('/api/inventory/:itemId/adjustments', (req, res) => {
  const db = loadDB();
  const product = Object.values(loadMenu()).flat().find(item => item.id === req.params.itemId && item.track_stock);
  const quantity = Number(req.body.quantity);
  const note = String(req.body.note || '').trim();
  if (!product) return res.status(404).json({ error:'Producto de inventario no encontrado' });
  if (!Number.isInteger(quantity) || quantity === 0 || Math.abs(quantity) > 100000) {
    return res.status(400).json({ error:'El ajuste debe ser un entero distinto de cero' });
  }
  if (!note || note.length > 200) return res.status(400).json({ error:'Escribe el motivo del ajuste' });
  const currentStock = stockFor(db, product.id);
  if (currentStock + quantity < 0) {
    return res.status(409).json({ error:`El ajuste dejaría el stock en negativo. Actualmente hay ${currentStock} unidades.` });
  }
  db.movimientos_stock.push({
    id:db._nextStockMovementId++, item_id:product.id, type:'ajuste', quantity,
    note, date:new Date().toISOString(),
  });
  saveDB(db);
  broadcastLive({ type:'inventory', item_id:product.id });
  res.json({ ok:true, stock:stockFor(db, product.id) });
});

// ── CAJA CHICA ────────────────────────────────────────────────

app.get('/api/cash-movements', (req, res) => {
  const db = loadDB();
  const fecha = req.query.fecha || todayStr();
  const location = validLocation(req.query.location) || 'restaurante';
  res.json(db.movimientos_caja.filter(m => m.fecha === fecha && m.location_id === location).reverse());
});

app.post('/api/cash-movements', (req, res) => {
  const db = loadDB();
  const fecha = todayStr();
  const location = validLocation(req.body.location_id);
  if (!location) return res.status(400).json({ error:'Local no válido' });
  if (db.cierres.some(c => c.fecha === fecha && c.location_id === location)) {
    return res.status(409).json({ error: 'La caja de hoy ya fue cerrada' });
  }
  const type = String(req.body.type || '');
  const amount = Number(req.body.amount);
  const concept = String(req.body.concept || '').trim();
  if (!['ingreso', 'egreso'].includes(type)) return res.status(400).json({ error: 'Tipo de movimiento no válido' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999.99) return res.status(400).json({ error: 'El valor no es válido' });
  if (!concept || concept.length > 150) return res.status(400).json({ error: 'Escribe un concepto válido' });
  const movement = {
    id:db._nextCashMovementId++, type, amount:fmt(amount), concept,
    fecha, hora:nowTime(), cierre_id:null, location_id:location,
  };
  db.movimientos_caja.push(movement);
  saveDB(db);
  broadcastLive({ type:'cash', location_id:location });
  res.json(movement);
});

// ── CUENTAS PENDIENTES ────────────────────────────────────────

app.get('/api/accounts', (req, res) => {
  const db = loadDB();
  res.json(db.cuentas.map(account => accountSummary(account, db.ventas)).sort((a, b) => b.id - a.id));
});

app.post('/api/accounts/:id/charges', (req, res) => {
  const db = loadDB();
  const account = db.cuentas.find(item => item.id === Number(req.params.id));
  if (!account) return res.status(404).json({ error:'Cuenta no encontrada' });
  const location = validLocation(req.body.location_id);
  if (!location) return res.status(400).json({ error:'Local no válido' });
  const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!requestedItems.length) return res.status(400).json({ error:'Agrega al menos un producto' });
  const catalog = Object.values(loadMenu()).flat();
  const productsById = Object.fromEntries(catalog.map(item => [item.id, item]));
  const items = [];
  for (const requested of requestedItems) {
    const product = productsById[String(requested.item_id || '')];
    const qty = Number(requested.qty);
    if (!product || !Number.isInteger(qty) || qty <= 0 || qty > 999) return res.status(400).json({ error:'Hay un producto o cantidad no válida' });
    if (product.price <= 0) return res.status(409).json({ error:`Configura primero el precio de ${product.name} en Carta` });
    items.push({ id:Date.now() + items.length, item_id:product.id, name:product.name, price:product.price, qty });
  }
  const tracked = Object.fromEntries(catalog.filter(item => item.track_stock).map(item => [item.id, item]));
  const stockRequirements = {};
  for (const item of items) {
    const product = productsById[item.item_id];
    if (product.stock_components?.length) {
      for (const component of product.stock_components) stockRequirements[component.item_id] = (stockRequirements[component.item_id] || 0) + component.quantity * item.qty;
    } else if (tracked[item.item_id]) stockRequirements[item.item_id] = (stockRequirements[item.item_id] || 0) + item.qty;
  }
  for (const [itemId, required] of Object.entries(stockRequirements)) {
    const available = stockFor(db, itemId);
    if (!tracked[itemId] || available < required) return res.status(409).json({ error:`Stock insuficiente de ${tracked[itemId]?.name || itemId}. Necesario: ${required}. Disponible: ${available}` });
  }
  const total = fmt(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const saleId = db._nextVentaId++;
  const sale = { id:saleId, mesa_id:null, mesa_numero:null, location_id:location, source:'cuenta', items,
    payment_method:'cuenta', payment_reference:'', account_id:account.id, account_name:account.name,
    account_room:account.room || '', collection_status:'pendiente',
    total, hora:nowTime(), fecha:todayStr() };
  db.ventas.push(sale);
  account.charges ||= [];
  account.charges.push({ id:db._nextAccountChargeId++, sale_id:saleId, amount:total, items,
    fecha:sale.fecha, hora:sale.hora, location_id:location, note:'Consumo agregado desde cuenta' });
  for (const [itemId, quantity] of Object.entries(stockRequirements)) db.movimientos_stock.push({
    id:db._nextStockMovementId++, item_id:itemId, type:'venta', quantity:-quantity,
    venta_id:saleId, location_id:location, date:new Date().toISOString(), note:`Cuenta ${account.name} · Hab. ${account.room || '-'}`,
  });
  saveDB(db);
  broadcastLive({ type:'sales', location_id:location });
  broadcastLive({ type:'accounts', location_id:location });
  if (Object.keys(stockRequirements).length) broadcastLive({ type:'inventory' });
  res.status(201).json(accountSummary(account, db.ventas));
});

app.post('/api/accounts/:id/payments', (req, res) => {
  const db = loadDB();
  const account = db.cuentas.find(item => item.id === Number(req.params.id));
  if (!account) return res.status(404).json({ error:'Cuenta no encontrada' });
  const current = accountSummary(account);
  const amount = fmt(Number(req.body.amount));
  const method = String(req.body.payment_method || '');
  const reference = method === 'efectivo' ? '' : String(req.body.payment_reference || '').trim();
  const location = validLocation(req.body.location_id);
  if (!['efectivo','tarjeta','transferencia'].includes(method)) return res.status(400).json({ error:'Método de pago no válido' });
  if (!location) return res.status(400).json({ error:'Local no válido' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > current.balance) return res.status(400).json({ error:`El pago debe estar entre $0.01 y $${current.balance.toFixed(2)}` });
  if (reference.length > 80) return res.status(400).json({ error:'El comprobante es demasiado largo' });
  account.payments ||= [];
  account.payments.push({ id:db._nextAccountPaymentId++, amount, payment_method:method,
    payment_reference:reference, fecha:todayStr(), hora:nowTime(), cierre_id:null, location_id:location });
  saveDB(db);
  broadcastLive({ type:'accounts', location_id:location });
  res.json(accountSummary(account));
});

app.post('/api/accounts/:id/internal', (req, res) => {
  const db = loadDB();
  const account = db.cuentas.find(item => item.id === Number(req.params.id));
  if (!account) return res.status(404).json({ error:'Cuenta no encontrada' });
  const current = accountSummary(account);
  const amount = fmt(Number(req.body.amount));
  const note = String(req.body.note || '').trim();
  const location = validLocation(req.body.location_id);
  if (!Number.isFinite(amount) || amount <= 0 || amount > current.balance) return res.status(400).json({ error:`El valor debe estar entre $0.01 y $${current.balance.toFixed(2)}` });
  if (!note || note.length > 150) return res.status(400).json({ error:'Escribe el motivo del consumo interno' });
  if (!location) return res.status(400).json({ error:'Local no válido' });
  account.writeoffs ||= [];
  account.writeoffs.push({ id:db._nextAccountWriteoffId++, amount, note, fecha:todayStr(), hora:nowTime(), location_id:location });
  saveDB(db);
  broadcastLive({ type:'accounts', location_id:location });
  res.json(accountSummary(account));
});

// ── MESAS ─────────────────────────────────────────────────────

app.get('/api/mesas', (req, res) => {
  const db = loadDB();
  const location = validLocation(req.query.location) || 'restaurante';
  res.json(db.mesas.filter(m => m.location_id === location).map(m => ({ ...m, total: mesaTotal(m) })));
});

app.post('/api/mesas/:id/print-kitchen', async (req, res) => {
  let db = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status === 'libre' || !mesa.items.length) return res.status(409).json({ error:'La mesa no tiene una comanda para imprimir' });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ mesa:mesa.id, openedAt:mesa.openedAt, items:mesa.items })).digest('hex');
  const recent = [...db.print_jobs].reverse().find(job => job.fingerprint === fingerprint &&
    ['pending','processing','printed'].includes(job.status) && Date.now() - new Date(job.created_at).getTime() < 10000);
  if (recent && req.body.force !== true) return res.json({ ok:true, duplicate:true, job:recent });
  const job = { id:db._nextPrintJobId++, type:'kitchen', mesa_id:mesa.id, mesa_numero:mesa.number,
    location_id:mesa.location_id, fingerprint, status:'pending', ticket:kitchenTicketData(mesa), copies:1,
    items:mesa.items.map(item => ({ item_id:item.item_id, name:item.name, qty:item.qty })), created_at:new Date().toISOString() };
  db.print_jobs.push(job); saveDB(db);
  broadcastLive({ type:'print-job', location_id:mesa.location_id });
  res.json({ ok:true, queued:true, job });
});

app.post('/api/mesas/:id/open', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'libre') return res.status(409).json({ error: 'La mesa ya está abierta' });
  mesa.status   = 'ocupada';
  mesa.openedAt = new Date().toISOString();
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/items', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada') return res.status(409).json({ error: 'La mesa no está abierta' });
  const { item_id } = req.body;
  const product = Object.values(loadMenu()).flat().find(item => item.id === item_id);
  if (!product) return res.status(400).json({ error: 'Producto no válido' });
  if (product.track_stock && product.price <= 0) {
    return res.status(409).json({ error: `Configura primero el precio de ${product.name} en la pestaña Carta` });
  }
  const existing = mesa.items.find(i => i.item_id === item_id);
  if (existing) {
    existing.qty += 1;
  } else {
    const rowId = Date.now();
    mesa.items.push({ id: rowId, item_id, name: product.name, price: product.price, qty: 1 });
  }
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.put('/api/mesas/:id/items/:rowId', (req, res) => {
  const db    = loadDB();
  const mesa  = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada') return res.status(409).json({ error: 'No se puede modificar esta mesa' });
  const delta = Number(req.body.delta);
  if (![1, -1].includes(delta)) return res.status(400).json({ error: 'Cantidad no válida' });
  const idx   = mesa.items.findIndex(i => i.id === Number(req.params.rowId));
  if (idx === -1) return res.status(404).json({ error: 'Ítem no encontrado' });
  mesa.items[idx].qty += delta;
  if (mesa.items[idx].qty <= 0) mesa.items.splice(idx, 1);
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.delete('/api/mesas/:id/items/:rowId', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada') return res.status(409).json({ error: 'No se puede modificar esta mesa' });
  mesa.items = mesa.items.filter(i => i.id !== Number(req.params.rowId));
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/cobrar', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada' || mesa.items.length === 0) return res.status(409).json({ error: 'La mesa no tiene un pedido para cobrar' });
  mesa.status = 'pagando';
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/cancelar-cobro', (req, res) => {
  const db = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'pagando') {
    return res.status(409).json({ error: 'La mesa no está en proceso de cobro' });
  }
  mesa.status = 'ocupada';
  saveDB(db);
  broadcastMesaChange(mesa);
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/cerrar', async (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  let createdSale = null;
  let inventoryChanged = false;
  if (!mesa) return;
  if (mesa.status === 'libre') return res.status(409).json({ error: 'La mesa ya está cerrada' });
  if (req.body.cobrado && mesa.status !== 'pagando') return res.status(409).json({ error: 'Primero debe marcar la mesa para cobrar' });
  if (req.body.cobrado && mesa.items.length > 0) {
    const paymentMethod = String(req.body.payment_method || '');
    if (!['efectivo', 'tarjeta', 'transferencia', 'cuenta'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Selecciona un método de pago válido' });
    }
    const paymentReference = ['tarjeta','transferencia'].includes(paymentMethod) ? String(req.body.payment_reference || '').trim() : '';
    if (paymentReference.length > 80) return res.status(400).json({ error: 'El número de comprobante es demasiado largo' });
    const invoiceRequested = req.body.invoice_requested === true;
    const customerName = invoiceRequested ? String(req.body.customer_name || '').trim() : '';
    const customerTaxId = invoiceRequested ? String(req.body.customer_tax_id || '').replace(/\s+/g, '') : '';
    const customerCity = invoiceRequested ? String(req.body.customer_city || '').trim() : '';
    if (invoiceRequested && (!customerName || customerName.length > 150)) return res.status(400).json({ error:'Escribe el nombre o razón social del cliente' });
    if (invoiceRequested && !/^(\d{10}|\d{13})$/.test(customerTaxId)) return res.status(400).json({ error:'La cédula debe tener 10 dígitos o el RUC 13 dígitos' });
    if (invoiceRequested && (!customerCity || customerCity.length > 100)) return res.status(400).json({ error:'Escribe la ciudad del cliente' });
    let account = null;
    if (paymentMethod === 'cuenta') {
      const accountType = String(req.body.account_type || '');
      const accountName = String(req.body.account_name || '').trim();
      const room = String(req.body.room || '').trim();
      if (!['habitacion','propietario','otro'].includes(accountType)) return res.status(400).json({ error:'Selecciona el tipo de cuenta' });
      if (!accountName || accountName.length > 100) return res.status(400).json({ error:'Escribe el nombre del huésped o responsable' });
      if (accountType === 'habitacion' && (!room || room.length > 20)) return res.status(400).json({ error:'Escribe el número de habitación' });
      account = db.cuentas.map(item => accountSummary(item)).filter(item => item.type === accountType &&
        item.balance > 0 && item.name.toLowerCase() === accountName.toLowerCase() && (item.room || '') === room)
        .sort((a, b) => b.id - a.id)[0];
      if (!account) {
        const accountId = db._nextAccountId++;
        account = { id:accountId, stay_id:`stay-${accountId}-${Date.now().toString(36)}`, reservation_id:null,
          type:accountType, name:accountName, room, created_at:new Date().toISOString(), charges:[], payments:[], writeoffs:[] };
        db.cuentas.push(account);
      } else {
        account = db.cuentas.find(item => item.id === account.id);
      }
    }
    const catalog = Object.values(loadMenu()).flat();
    const productsById = Object.fromEntries(catalog.map(item => [item.id, item]));
    const tracked = Object.fromEntries(catalog.filter(item => item.track_stock).map(item => [item.id, item]));
    const stockRequirements = {};
    for (const item of mesa.items) {
      const product = productsById[item.item_id];
      if (product?.stock_components?.length) {
        for (const component of product.stock_components) {
          stockRequirements[component.item_id] = (stockRequirements[component.item_id] || 0) + component.quantity * item.qty;
        }
      } else if (tracked[item.item_id]) {
        stockRequirements[item.item_id] = (stockRequirements[item.item_id] || 0) + item.qty;
      }
    }
    for (const [itemId, required] of Object.entries(stockRequirements)) {
      if (!tracked[itemId] || stockFor(db, itemId) < required) {
        return res.status(409).json({
          error: `Stock insuficiente de ${tracked[itemId]?.name || itemId}. Necesario: ${required}. Disponible: ${stockFor(db, itemId)}`,
        });
      }
    }
    const total = fmt(mesaTotal(mesa));
    const ventaId = db._nextVentaId++;
    createdSale = {
      id:      ventaId,
      mesa_id: mesa.id,
      mesa_numero: mesa.number,
      location_id: mesa.location_id,
      items:   [...mesa.items],
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      invoice_requested: invoiceRequested,
      customer_name: customerName,
      customer_tax_id: customerTaxId,
      customer_city: customerCity,
      account_id: account?.id || null,
      collection_status: paymentMethod === 'cuenta' ? 'pendiente' : 'pagada',
      total,
      hora:  nowTime(),
      fecha: todayStr(),
    };
    db.ventas.push(createdSale);
    if (account) account.charges.push({ id:db._nextAccountChargeId++, sale_id:ventaId,
      amount:total, items:[...mesa.items], fecha:todayStr(), hora:nowTime(), location_id:mesa.location_id, note:String(req.body.account_note || '').trim().slice(0,150) });
    for (const [itemId, quantity] of Object.entries(stockRequirements)) {
      db.movimientos_stock.push({
        id: db._nextStockMovementId++, item_id:itemId, type:'venta',
        quantity:-quantity, venta_id:ventaId, location_id:mesa.location_id, date:new Date().toISOString(), note:`Mesa ${mesa.number} · ${mesa.location_id}`,
      });
    }
    inventoryChanged = Object.keys(stockRequirements).length > 0;
  }
  mesa.status   = 'libre';
  mesa.openedAt = null;
  mesa.items    = [];
  saveDB(db);
  broadcastMesaChange(mesa);
  if (createdSale) broadcastLive({ type:'sales', location_id:createdSale.location_id });
  if (inventoryChanged) broadcastLive({ type:'inventory' });
  let receiptError = '';
  if (createdSale) {
    const latest = loadDB();
    latest.print_jobs.push({ id:latest._nextPrintJobId++, type:'receipt', sale_id:createdSale.id,
      location_id:createdSale.location_id, status:'pending', ticket:receiptTicketData(createdSale), copies:2,
      created_at:new Date().toISOString() });
    saveDB(latest);
    broadcastLive({ type:'print-job', location_id:createdSale.location_id });
  }
  res.json({ ok:true, sale:createdSale, receipt_printed:false, receipt_queued:Boolean(createdSale), receipt_error:receiptError });
});

// ── VENTAS ────────────────────────────────────────────────────

app.get('/api/ventas', (req, res) => {
  const db    = loadDB();
  const fecha = req.query.fecha || todayStr();
  const location = validLocation(req.query.location);
  res.json(db.ventas.filter(v => v.fecha === fecha && (!location || v.location_id === location)).reverse());
});

app.post('/api/ventas/:id/print-receipt', (req, res) => {
  const db = loadDB();
  const sale = db.ventas.find(item => item.id === Number(req.params.id));
  if (!sale) return res.status(404).json({ error:'Venta no encontrada' });
  const job = { id:db._nextPrintJobId++, type:'receipt', sale_id:sale.id, location_id:sale.location_id,
    status:'pending', ticket:receiptTicketData(sale), copies:2, created_at:new Date().toISOString() };
  db.print_jobs.push(job); saveDB(db);
  broadcastLive({ type:'print-job', location_id:sale.location_id });
  res.json({ ok:true, queued:true, job_id:job.id });
});

app.post('/api/print-jobs/claim', (req, res) => {
  const location = validLocation(req.body.location_id);
  if (!location) return res.status(400).json({ error:'Local no válido' });
  const db = loadDB();
  const now = Date.now();
  for (const item of db.print_jobs) if (item.status === 'processing' && now - new Date(item.claimed_at || 0).getTime() > 120000) item.status = 'pending';
  const job = db.print_jobs.find(item => item.location_id === location && item.ticket && ['pending','error'].includes(item.status));
  if (!job) { saveDB(db); return res.status(204).end(); }
  job.status = 'processing'; job.claimed_at = new Date().toISOString(); job.agent = String(req.body.agent || '').slice(0,100);
  saveDB(db); res.json(job);
});

app.post('/api/print-jobs/:id/complete', (req, res) => {
  const db = loadDB();
  const job = db.print_jobs.find(item => item.id === Number(req.params.id));
  if (!job) return res.status(404).json({ error:'Trabajo no encontrado' });
  const ok = req.body.ok === true;
  job.status = ok ? 'printed' : 'error'; job.error = ok ? '' : String(req.body.error || 'Error de impresión').slice(0,500);
  job.attempts = Number(job.attempts || 0) + 1;
  if (ok) job.printed_at = new Date().toISOString();
  saveDB(db); res.json({ ok:true });
});

// ── REPORTES GENERALES ────────────────────────────────────────

function localDateToISO(value) {
  const parts = String(value || '').split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function buildReport(db, from, to, location=null) {
  const ventas = db.ventas.filter(v => {
    const date = localDateToISO(v.fecha);
    return date >= from && date <= to && (!location || v.location_id === location);
  });
  const cashMovements = db.movimientos_caja.filter(m => {
    const date = localDateToISO(m.fecha);
    return date >= from && date <= to && (!location || m.location_id === location);
  });
  const accountPayments = db.cuentas.flatMap(account => (account.payments || []).map(payment => ({ ...payment, account_id:account.id, account_name:account.name })))
    .filter(payment => { const date = localDateToISO(payment.fecha); return date >= from && date <= to && (!location || payment.location_id === location); });
  const accountWriteoffs = db.cuentas.flatMap(account => (account.writeoffs || []).map(item => ({ ...item, account_id:account.id, account_name:account.name })))
    .filter(item => { const date = localDateToISO(item.fecha); return date >= from && date <= to && (!location || item.location_id === location); });
  const byDay = {};
  const products = {};
  for (const sale of ventas) {
    const day = byDay[sale.fecha] ||= { fecha:sale.fecha, ventas:0, total:0, efectivo:0, tarjeta:0, transferencia:0, cuenta:0 };
    day.ventas += 1;
    day.total = fmt(day.total + sale.total);
    const method = sale.payment_method || 'efectivo';
    day[method] = fmt(day[method] + sale.total);
    for (const item of sale.items || []) {
      const product = products[item.item_id] ||= { id:item.item_id, name:item.name, quantity:0, revenue:0 };
      product.quantity += item.qty;
      product.revenue = fmt(product.revenue + item.price * item.qty);
    }
  }
  const methodTotal = method => fmt(
    ventas.filter(v => (v.payment_method || 'efectivo') === method).reduce((sum, v) => sum + v.total, 0) +
    accountPayments.filter(p => p.payment_method === method).reduce((sum, p) => sum + p.amount, 0)
  );
  const locations = Object.fromEntries(LOCATIONS.map(id => {
    const rows = ventas.filter(v => v.location_id === id);
    return [id, { sales_count:rows.length, total:fmt(rows.reduce((sum, v) => sum + v.total, 0)) }];
  }));
  return {
    from, to, location:location || 'all', ventas, locations,
    summary:{
      sales_count:ventas.length,
      total:fmt(ventas.reduce((sum, v) => sum + v.total, 0)),
      efectivo:methodTotal('efectivo'), tarjeta:methodTotal('tarjeta'), transferencia:methodTotal('transferencia'),
      account_charges:fmt(ventas.filter(v => v.payment_method === 'cuenta').reduce((sum, v) => sum + v.total, 0)),
      account_payments:fmt(accountPayments.reduce((sum, p) => sum + p.amount, 0)),
      internal_consumption:fmt(accountWriteoffs.reduce((sum, item) => sum + item.amount, 0)),
      cash_in:fmt(cashMovements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0)),
      cash_out:fmt(cashMovements.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0)),
    },
    days:Object.values(byDay).sort((a, b) => localDateToISO(a.fecha).localeCompare(localDateToISO(b.fecha))),
    products:Object.values(products).sort((a, b) => b.revenue - a.revenue),
    cash_movements:cashMovements,
    account_payments:accountPayments,
    account_writeoffs:accountWriteoffs,
  };
}

function reportParams(req, res) {
  const { from, to } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
    res.status(400).json({ error:'Selecciona un rango de fechas válido' });
    return null;
  }
  const location = req.query.location && req.query.location !== 'all' ? validLocation(req.query.location) : null;
  if (req.query.location && req.query.location !== 'all' && !location) {
    res.status(400).json({ error:'Local no válido' }); return null;
  }
  return { from, to, location };
}

app.get('/api/reports', (req, res) => {
  const range = reportParams(req, res);
  if (!range) return;
  res.json(buildReport(loadDB(), range.from, range.to, range.location));
});

app.get('/api/export/report', async (req, res) => {
  const range = reportParams(req, res);
  if (!range) return;
  const report = buildReport(loadDB(), range.from, range.to, range.location);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'River Paradise';
  const header = row => {
    row.font = { bold:true, color:{ argb:'FFFFFFFF' } };
    row.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  };

  const summary = wb.addWorksheet('Resumen general');
  summary.columns = [{ key:'label', width:30 }, { key:'value', width:20 }];
  header(summary.addRow(['REPORTE GENERAL — RIVER PARADISE', '']));
  summary.mergeCells('A1:B1');
  summary.addRow(['Desde', report.from]); summary.addRow(['Hasta', report.to]); summary.addRow([]);
  summary.addRow(['Local', report.location === 'all' ? 'Consolidado' : report.location]);
  summary.addRow(['Número de ventas', report.summary.sales_count]);
  summary.addRow(['TOTAL VENDIDO', `$${report.summary.total.toFixed(2)}`]);
  summary.addRow(['Efectivo', `$${report.summary.efectivo.toFixed(2)}`]);
  summary.addRow(['Tarjeta', `$${report.summary.tarjeta.toFixed(2)}`]);
  summary.addRow(['Transferencia', `$${report.summary.transferencia.toFixed(2)}`]);
  summary.addRow(['Cargado a cuentas', `$${report.summary.account_charges.toFixed(2)}`]);
  summary.addRow(['Cobros posteriores de cuentas', `$${report.summary.account_payments.toFixed(2)}`]);
  summary.addRow(['Consumo interno', `$${report.summary.internal_consumption.toFixed(2)}`]);
  summary.addRow(['Ingresos caja chica', `$${report.summary.cash_in.toFixed(2)}`]);
  summary.addRow(['Egresos caja chica', `$${report.summary.cash_out.toFixed(2)}`]);
  if (report.location === 'all') {
    summary.addRow(['Total restaurante', `$${report.locations.restaurante.total.toFixed(2)}`]);
    summary.addRow(['Total cafetería', `$${report.locations.cafeteria.total.toFixed(2)}`]);
  }

  const daily = wb.addWorksheet('Resumen por día');
  daily.columns = [
    { header:'Fecha', key:'fecha', width:14 }, { header:'Ventas', key:'ventas', width:10 },
    { header:'Total', key:'total', width:14 }, { header:'Efectivo', key:'efectivo', width:14 },
    { header:'Tarjeta', key:'tarjeta', width:14 }, { header:'Transferencia', key:'transferencia', width:16 },
  ]; header(daily.getRow(1));
  report.days.forEach(day => daily.addRow(day));
  ['total','efectivo','tarjeta','transferencia'].forEach(key => { daily.getColumn(key).numFmt = '$0.00'; });

  const detail = wb.addWorksheet('Detalle de ventas');
  detail.columns = [
    { header:'#', key:'id', width:7 }, { header:'Local', key:'location', width:14 }, { header:'Fecha', key:'fecha', width:13 }, { header:'Hora', key:'hora', width:12 },
    { header:'Mesa', key:'mesa', width:9 }, { header:'Forma de pago', key:'payment', width:18 },
    { header:'Nº comprobante', key:'reference', width:20 }, { header:'Ítems', key:'items', width:45 },
    { header:'Total', key:'total', width:13 },
  ]; header(detail.getRow(1));
  report.ventas.forEach(v => detail.addRow({ id:v.id, location:v.location_id, fecha:v.fecha, hora:v.hora, mesa:v.source === 'cuenta' ? `Cuenta Hab. ${v.account_room || '-'}` : `Mesa ${v.mesa_numero || v.mesa_id}`,
    payment:v.payment_method || 'efectivo', reference:v.payment_reference || '',
    items:(v.items || []).map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', '),
    total:v.total }));
  detail.getColumn('total').numFmt = '$0.00';

  const top = wb.addWorksheet('Productos vendidos');
  top.columns = [{ header:'Producto', key:'name', width:34 }, { header:'Unidades', key:'quantity', width:13 }, { header:'Ingresos', key:'revenue', width:15 }];
  header(top.getRow(1)); report.products.forEach(product => top.addRow(product)); top.getColumn('revenue').numFmt = '$0.00';

  const cash = wb.addWorksheet('Caja chica');
  cash.columns = [{ header:'Fecha', key:'fecha', width:13 }, { header:'Hora', key:'hora', width:12 }, { header:'Tipo', key:'type', width:12 }, { header:'Concepto', key:'concept', width:40 }, { header:'Valor', key:'amount', width:14 }];
  header(cash.getRow(1)); report.cash_movements.forEach(m => cash.addRow(m)); cash.getColumn('amount').numFmt = '$0.00';

  const accounts = wb.addWorksheet('Cobros de cuentas');
  accounts.columns = [{ header:'Fecha', key:'fecha', width:13 }, { header:'Hora', key:'hora', width:12 },
    { header:'Cuenta', key:'account_name', width:28 }, { header:'Forma de pago', key:'payment_method', width:18 },
    { header:'Nº comprobante', key:'payment_reference', width:20 }, { header:'Valor', key:'amount', width:14 }];
  header(accounts.getRow(1)); report.account_payments.forEach(payment => accounts.addRow(payment)); accounts.getColumn('amount').numFmt = '$0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${report.location}_${range.from}_${range.to}.xlsx"`);
  await polishWorkbook(wb, ['Resumen general']);
  await wb.xlsx.write(res);
  res.end();
});

// ── CIERRES ───────────────────────────────────────────────────

app.get('/api/cierres', (req, res) => {
  const db = loadDB();
  const location = validLocation(req.query.location);
  res.json(db.cierres.filter(c => !location || c.location_id === location).reverse());
});

app.get('/api/cierres/:id', (req, res) => {
  const db     = loadDB();
  const cierre = db.cierres.find(c => c.id === Number(req.params.id));
  if (!cierre) return res.status(404).json({ error: 'Cierre no encontrado' });
  res.json(cierre);
});

app.post('/api/cierres', (req, res) => {
  const db    = loadDB();
  const fecha = todayStr();
  const location = validLocation(req.body.location_id);
  if (!location) return res.status(400).json({ error:'Local no válido' });
  const fondoSolicitado = Number(req.body.fondo_inicial);
  if (!Number.isFinite(fondoSolicitado) || fondoSolicitado < 0) {
    return res.status(400).json({ error: 'El fondo inicial no es válido' });
  }
  if (db.cierres.some(c => c.fecha === fecha && c.location_id === location)) {
    return res.status(409).json({ error: 'La caja de hoy ya fue cerrada' });
  }
  const ventas = db.ventas.filter(v => v.fecha === fecha && v.location_id === location && !v.cierre_id);
  const cashMovements = db.movimientos_caja.filter(m => m.fecha === fecha && m.location_id === location && !m.cierre_id);
  const accountPayments = db.cuentas.flatMap(account => (account.payments || [])
    .filter(payment => payment.fecha === fecha && payment.location_id === location && !payment.cierre_id)
    .map(payment => ({ ...payment, account_id:account.id, account_name:account.name })));
  if (ventas.length === 0 && cashMovements.length === 0 && accountPayments.length === 0) return res.status(400).json({ error: 'No hay movimientos para cerrar hoy' });

  const total_ventas = fmt(ventas.reduce((s, v) => s + v.total, 0));
  const total_cuentas = fmt(ventas.filter(v => v.payment_method === 'cuenta').reduce((s, v) => s + v.total, 0));
  const accountPaidBy = method => accountPayments.filter(p => p.payment_method === method).reduce((s, p) => s + p.amount, 0);
  const total_efectivo = fmt(ventas.filter(v => (v.payment_method || 'efectivo') === 'efectivo').reduce((s, v) => s + v.total, 0) + accountPaidBy('efectivo'));
  const total_tarjeta = fmt(ventas.filter(v => v.payment_method === 'tarjeta').reduce((s, v) => s + v.total, 0) + accountPaidBy('tarjeta'));
  const total_transferencia = fmt(ventas.filter(v => v.payment_method === 'transferencia').reduce((s, v) => s + v.total, 0) + accountPaidBy('transferencia'));
  const total_cobros_cuentas = fmt(accountPayments.reduce((s, p) => s + p.amount, 0));
  const total_ingresos_caja = fmt(cashMovements.filter(m => m.type === 'ingreso').reduce((s, m) => s + m.amount, 0));
  const total_egresos_caja = fmt(cashMovements.filter(m => m.type === 'egreso').reduce((s, m) => s + m.amount, 0));
  const fondo        = fmt(fondoSolicitado);
  const total_caja   = fmt(fondo + total_efectivo + total_ingresos_caja - total_egresos_caja);

  const cierre = {
    id:            db._nextCierreId++,
    location_id:   location,
    fecha, hora:   nowTime(),
    fondo_inicial: fondo,
    total_ventas, total_cuentas, total_cobros_cuentas, total_efectivo, total_tarjeta, total_transferencia,
    total_ingresos_caja, total_egresos_caja, total_caja,
    num_ventas:    ventas.length,
    ventas:        [...ventas],
    movimientos_caja:[...cashMovements],
    pagos_cuentas:[...accountPayments],
  };
  db.cierres.push(cierre);
  for (const venta of ventas) venta.cierre_id = cierre.id;
  for (const movement of cashMovements) movement.cierre_id = cierre.id;
  for (const account of db.cuentas) for (const payment of account.payments || []) {
    if (payment.fecha === fecha && payment.location_id === location && !payment.cierre_id) payment.cierre_id = cierre.id;
  }
  saveDB(db);
  broadcastLive({ type:'closing', location_id:location, closing_id:cierre.id });
  res.json(cierre);
});

// ── EXPORT EXCEL ──────────────────────────────────────────────

app.get('/api/export/cierre/:id', async (req, res) => {
  const db     = loadDB();
  const cierre = db.cierres.find(c => c.id === Number(req.params.id));
  if (!cierre) return res.status(404).json({ error: 'No encontrado' });

  const wb  = new ExcelJS.Workbook();
  wb.creator = 'River Paradise';

  // Hoja 1 — Resumen
  const ws1 = wb.addWorksheet('Resumen');
  ws1.columns = [{ key:'label', width:28 }, { key:'value', width:18 }];
  const t = ws1.addRow(['CIERRE DE CAJA — RIVER PARADISE', '']);
  t.font = { bold:true, size:14, color:{ argb:'FFFFFFFF' } };
  t.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  ws1.mergeCells('A1:B1');
  ws1.addRow(['']);
  ws1.addRow(['Fecha', cierre.fecha]);
  ws1.addRow(['Local', cierre.location_id || 'restaurante']);
  ws1.addRow(['Hora de cierre', cierre.hora]);
  ws1.addRow(['']);
  const h = ws1.addRow(['RESUMEN FINANCIERO', '']);
  h.font = { bold:true };
  h.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFAEEDA' } };
  ws1.addRow(['Número de ventas',  cierre.num_ventas]);
  ws1.addRow(['Fondo inicial',     `$${cierre.fondo_inicial.toFixed(2)}`]);
  ws1.addRow(['Total ventas',      `$${cierre.total_ventas.toFixed(2)}`]);
  ws1.addRow(['Pagos en efectivo', `$${(cierre.total_efectivo ?? cierre.total_ventas).toFixed(2)}`]);
  ws1.addRow(['Pagos con tarjeta', `$${(cierre.total_tarjeta ?? 0).toFixed(2)}`]);
  ws1.addRow(['Transferencias',    `$${(cierre.total_transferencia ?? 0).toFixed(2)}`]);
  ws1.addRow(['Cargado a cuentas', `$${(cierre.total_cuentas ?? 0).toFixed(2)}`]);
  ws1.addRow(['Cobros de cuentas pendientes', `$${(cierre.total_cobros_cuentas ?? 0).toFixed(2)}`]);
  ws1.addRow(['Ingresos caja chica', `$${(cierre.total_ingresos_caja ?? 0).toFixed(2)}`]);
  ws1.addRow(['Egresos caja chica', `$${(cierre.total_egresos_caja ?? 0).toFixed(2)}`]);
  const tot = ws1.addRow(['TOTAL EN CAJA', `$${cierre.total_caja.toFixed(2)}`]);
  tot.font = { bold:true, size:13 };
  tot.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFEAF3DE' } };

  // Hoja 2 — Detalle ventas
  const ws2 = wb.addWorksheet('Detalle de ventas');
  ws2.columns = [
    { header:'#',        key:'num',      width:6  },
    { header:'Mesa',     key:'mesa',     width:8  },
    { header:'Hora',     key:'hora',     width:10 },
    { header:'Forma de pago', key:'payment', width:18 },
    { header:'Nº comprobante', key:'reference', width:20 },
    { header:'Ítems',    key:'items',    width:44 },
    { header:'Total',    key:'total',    width:12 },
  ];
  ws2.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws2.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  cierre.ventas.forEach((v, i) => ws2.addRow({
    num: i+1, mesa:v.source === 'cuenta' ? `Hab. ${v.account_room || '-'}` : `Mesa ${v.mesa_numero || v.mesa_id}`, hora: v.hora, payment:v.payment_method || 'efectivo', reference:v.payment_reference || '',
    items:    v.items.map(it => it.name + (it.qty > 1 ? ' x'+it.qty : '')).join(', '),
    total:    v.total,
  }));
  ws2.getColumn('total').numFmt = '$#,##0.00';

  // Hoja 3 — Top productos
  const ws3 = wb.addWorksheet('Top productos');
  ws3.columns = [
    { header:'Producto',  key:'name', width:30 },
    { header:'Unidades',  key:'qty',  width:12 },
    { header:'Ingresos',  key:'rev',  width:14 },
  ];
  ws3.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws3.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  const topMap = {};
  for (const v of cierre.ventas)
    for (const it of v.items) {
      if (!topMap[it.name]) topMap[it.name] = { name:it.name, qty:0, rev:0 };
      topMap[it.name].qty += it.qty;
      topMap[it.name].rev += it.price * it.qty;
    }
  Object.values(topMap).sort((a,b) => b.rev - a.rev)
    .forEach(it => ws3.addRow({ name:it.name, qty:it.qty, rev:it.rev }));
  ws3.getColumn('rev').numFmt = '$#,##0.00';

  const ws4 = wb.addWorksheet('Caja chica');
  ws4.columns = [
    { header:'Hora', key:'hora', width:12 },
    { header:'Tipo', key:'type', width:12 },
    { header:'Concepto', key:'concept', width:40 },
    { header:'Valor', key:'amount', width:14 },
  ];
  ws4.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws4.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  for (const movement of cierre.movimientos_caja || []) ws4.addRow({
    hora:movement.hora, type:movement.type, concept:movement.concept,
    amount:movement.amount,
  });
  ws4.getColumn('amount').numFmt = '$#,##0.00';

  const ws5 = wb.addWorksheet('Cobros de cuentas');
  ws5.columns = [
    { header:'Hora', key:'hora', width:12 }, { header:'Cuenta', key:'account_name', width:28 },
    { header:'Forma de pago', key:'payment_method', width:18 },
    { header:'Nº comprobante', key:'payment_reference', width:20 }, { header:'Valor', key:'amount', width:14 },
  ];
  ws5.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws5.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  for (const payment of cierre.pagos_cuentas || []) ws5.addRow({ ...payment, amount:payment.amount });
  ws5.getColumn('amount').numFmt = '$#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cierre_${cierre.fecha.replace(/\//g,'-')}_${cierre.hora.replace(':','-')}.xlsx"`);
  await polishWorkbook(wb, ['Resumen']);
  await wb.xlsx.write(res);
  res.end();
});

app.get('/api/export/ventas', async (req, res) => {
  const db     = loadDB();
  const fecha  = req.query.fecha || todayStr();
  const location = validLocation(req.query.location);
  const ventas = db.ventas.filter(v => v.fecha === fecha && (!location || v.location_id === location));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ventas');
  ws.columns = [
    { header:'#',        key:'num',      width:6  },
    { header:'Mesa',     key:'mesa',     width:8  },
    { header:'Fecha',    key:'fecha',    width:12 },
    { header:'Hora',     key:'hora',     width:10 },
    { header:'Forma de pago', key:'payment', width:18 },
    { header:'Nº comprobante', key:'reference', width:20 },
    { header:'Ítems',    key:'items',    width:44 },
    { header:'Total',    key:'total',    width:12 },
  ];
  ws.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  ventas.forEach((v, i) => ws.addRow({
    num: i+1, mesa:v.source === 'cuenta' ? `Hab. ${v.account_room || '-'}` : `Mesa ${v.mesa_numero || v.mesa_id}`, fecha: v.fecha, hora: v.hora, payment:v.payment_method || 'efectivo', reference:v.payment_reference || '',
    items:    v.items.map(it => it.name + (it.qty > 1 ? ' x'+it.qty : '')).join(', '),
    total:    v.total,
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ventas_${location || 'general'}_${fecha.replace(/\//g,'-')}.xlsx"`);
  ws.getColumn('total').numFmt = '$#,##0.00';
  await polishWorkbook(wb);
  await wb.xlsx.write(res);
  res.end();
});

app.get('/api/export/solicitudes-factura', async (req, res) => {
  const db = loadDB();
  const fecha = req.query.fecha || todayStr();
  const location = validLocation(req.query.location);
  const requests = db.ventas.filter(sale => sale.fecha === fecha && sale.invoice_requested && (!location || sale.location_id === location));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Solicitudes de factura');
  ws.columns = [
    { header:'Venta', key:'id', width:10 }, { header:'Nombre / Razón social', key:'name', width:35 },
    { header:'RUC / Cédula', key:'tax_id', width:18 }, { header:'Fecha', key:'date', width:14 },
    { header:'Ciudad', key:'city', width:22 }, { header:'Valor de consumo', key:'total', width:18 },
    { header:'Local', key:'location', width:16 }, { header:'Mesa', key:'table', width:10 },
  ];
  ws.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  for (const sale of requests) ws.addRow({ id:sale.id, name:sale.customer_name, tax_id:sale.customer_tax_id,
    date:sale.fecha, city:sale.customer_city, total:sale.total, location:sale.location_id, table:sale.mesa_numero || sale.mesa_id });
  ws.getColumn('total').numFmt = '$0.00';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="solicitudes_factura_${location || 'general'}_${fecha.replace(/\//g,'-')}.xlsx"`);
  await polishWorkbook(wb);
  await wb.xlsx.write(res);
  res.end();
});

app.get('/api/export/accounts/:id', async (req, res) => {
  const db = loadDB();
  const raw = db.cuentas.find(item => item.id === Number(req.params.id));
  if (!raw) return res.status(404).json({ error:'Cuenta no encontrada' });
  const account = accountSummary(raw, db.ventas);
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Estado de cuenta');
  summary.columns = [{ key:'label', width:28 }, { key:'value', width:34 }];
  summary.addRow(['ESTADO DE CUENTA — RIVER PARADISE', '']); summary.mergeCells('A1:B1');
  summary.addRow([]); summary.addRow(['Huésped / responsable', account.name]);
  summary.addRow(['Habitación', account.room || 'No aplica']);
  summary.addRow(['Identificador de estadía', account.stay_id]);
  summary.addRow(['Identificador de reserva', account.reservation_id || 'Pendiente de integración']);
  summary.addRow(['Cuenta creada', account.created_at ? new Date(account.created_at).toLocaleString('es-EC') : '']);
  summary.addRow([]); summary.addRow(['Total consumos', account.charged]);
  summary.addRow(['Total pagado', account.paid]); summary.addRow(['Consumo interno', account.internal]);
  summary.addRow(['SALDO PENDIENTE', account.balance]);
  ['B9','B10','B11','B12'].forEach(cell => { summary.getCell(cell).numFmt = '$#,##0.00'; });

  const charges = wb.addWorksheet('Detalle de consumos');
  charges.columns = [
    { header:'Fecha', key:'date', width:14 }, { header:'Hora', key:'time', width:12 },
    { header:'Local', key:'location', width:16 }, { header:'Venta', key:'sale', width:10 },
    { header:'Cantidad', key:'qty', width:12 }, { header:'Producto', key:'product', width:34 },
    { header:'Precio unitario', key:'price', width:17 }, { header:'Subtotal', key:'subtotal', width:16 },
  ];
  for (const charge of account.charges) {
    if (charge.items?.length) for (const item of charge.items) charges.addRow({ date:charge.fecha, time:charge.hora,
      location:charge.location_id, sale:charge.sale_id, qty:item.qty, product:item.name, price:item.price, subtotal:fmt(item.price * item.qty) });
    else charges.addRow({ date:charge.fecha, time:charge.hora, location:charge.location_id, sale:charge.sale_id,
      qty:'', product:charge.note || 'Consumo sin detalle', price:'', subtotal:charge.amount });
  }
  charges.getColumn('price').numFmt = '$#,##0.00'; charges.getColumn('subtotal').numFmt = '$#,##0.00';

  const payments = wb.addWorksheet('Pagos');
  payments.columns = [
    { header:'Fecha', key:'fecha', width:14 }, { header:'Hora', key:'hora', width:12 },
    { header:'Forma de pago', key:'payment_method', width:20 }, { header:'Comprobante', key:'payment_reference', width:22 },
    { header:'Local', key:'location_id', width:16 }, { header:'Valor', key:'amount', width:16 },
  ];
  for (const payment of account.payments || []) payments.addRow(payment);
  payments.getColumn('amount').numFmt = '$#,##0.00';
  await polishWorkbook(wb, ['Estado de cuenta']);
  const safeName = account.name.replace(/[^a-zA-Z0-9À-ſ]+/g, '_').slice(0, 40);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="estado_cuenta_${safeName}_hab_${account.room || 'NA'}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

app.get('/api/export/accounts-pending/all', async (req, res) => {
  const db = loadDB();
  const accounts = db.cuentas.map(account => accountSummary(account, db.ventas))
    .filter(account => account.balance > 0).sort((a, b) => String(a.room || '').localeCompare(String(b.room || ''), 'es', { numeric:true }));
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Cuentas pendientes');
  summary.columns = [
    { header:'Habitación', key:'room', width:14 }, { header:'Huésped / responsable', key:'name', width:34 },
    { header:'Tipo', key:'type', width:18 }, { header:'Estadía', key:'stay', width:28 },
    { header:'Reserva', key:'reservation', width:20 }, { header:'Total consumos', key:'charged', width:18 },
    { header:'Pagado', key:'paid', width:15 }, { header:'Consumo interno', key:'internal', width:18 },
    { header:'Saldo pendiente', key:'balance', width:18 },
  ];
  for (const account of accounts) summary.addRow({ room:account.room || 'No aplica', name:account.name,
    type:account.type, stay:account.stay_id, reservation:account.reservation_id || '', charged:account.charged,
    paid:account.paid, internal:account.internal, balance:account.balance });
  ['charged','paid','internal','balance'].forEach(key => { summary.getColumn(key).numFmt = '$#,##0.00'; });
  if (accounts.length) {
    const totalRow = summary.addRow({ name:'TOTAL GENERAL', charged:accounts.reduce((sum, item) => sum + item.charged, 0),
      paid:accounts.reduce((sum, item) => sum + item.paid, 0), internal:accounts.reduce((sum, item) => sum + item.internal, 0),
      balance:accounts.reduce((sum, item) => sum + item.balance, 0) });
    totalRow.font = { bold:true, color:{ argb:'FF235347' } };
    totalRow.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFE7F2EE' } };
  }

  const detail = wb.addWorksheet('Detalle de consumos');
  detail.columns = [
    { header:'Habitación', key:'room', width:14 }, { header:'Huésped', key:'guest', width:30 },
    { header:'Fecha', key:'date', width:14 }, { header:'Hora', key:'time', width:12 },
    { header:'Local', key:'location', width:16 }, { header:'Venta', key:'sale', width:10 },
    { header:'Cantidad', key:'qty', width:12 }, { header:'Producto', key:'product', width:34 },
    { header:'Precio unitario', key:'price', width:17 }, { header:'Subtotal', key:'subtotal', width:16 },
  ];
  for (const account of accounts) for (const charge of account.charges || []) {
    if (charge.items?.length) for (const item of charge.items) detail.addRow({ room:account.room || 'No aplica', guest:account.name,
      date:charge.fecha, time:charge.hora, location:charge.location_id, sale:charge.sale_id, qty:item.qty,
      product:item.name, price:item.price, subtotal:fmt(item.price * item.qty) });
    else detail.addRow({ room:account.room || 'No aplica', guest:account.name, date:charge.fecha, time:charge.hora,
      location:charge.location_id, sale:charge.sale_id, product:charge.note || 'Consumo sin detalle', subtotal:charge.amount });
  }
  detail.getColumn('price').numFmt = '$#,##0.00'; detail.getColumn('subtotal').numFmt = '$#,##0.00';
  await polishWorkbook(wb);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cuentas_pendientes_${todayStr().replace(/\//g, '-')}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

// ── Arrancar ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno. No se guardaron los cambios.' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅  River Paradise corriendo en http://localhost:${PORT}`);
  console.log(`📁  Datos en: ${DB_FILE}`);
});
