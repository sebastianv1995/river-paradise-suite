const express = require('express');
const cors    = require('cors');
const ExcelJS = require('exceljs');
const fs      = require('fs');
const path    = require('path');

const app     = express();
const PORT    = Number(process.env.PORT) || 3001;
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'river_paradise.json');
const MENU_FILE = path.join(__dirname, '..', 'menu.json');
const LOCATIONS = ['restaurante', 'cafeteria'];

// ── Base de datos JSON ────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
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

function accountSummary(account) {
  const charged = fmt((account.charges || []).reduce((sum, item) => sum + item.amount, 0));
  const paid = fmt((account.payments || []).reduce((sum, item) => sum + item.amount, 0));
  const internal = fmt((account.writeoffs || []).reduce((sum, item) => sum + item.amount, 0));
  return { ...account, charged, paid, internal, balance:fmt(charged - paid - internal) };
}

function validLocation(value) {
  return LOCATIONS.includes(value) ? value : null;
}

// ── CARTA ─────────────────────────────────────────────────────

app.get('/api/menu', (req, res) => {
  res.json(loadMenu());
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
  saveMenu(menu);
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
  const quantity = Number(req.body.quantity);
  if (!product) return res.status(404).json({ error: 'Producto de inventario no encontrado' });
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) {
    return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a cero' });
  }
  db.movimientos_stock.push({
    id: db._nextStockMovementId++, item_id: product.id, type: 'entrada', quantity,
    note: String(req.body.note || '').trim().slice(0, 200),
    date: new Date().toISOString(),
  });
  saveDB(db);
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
  res.json(movement);
});

// ── CUENTAS PENDIENTES ────────────────────────────────────────

app.get('/api/accounts', (req, res) => {
  const db = loadDB();
  res.json(db.cuentas.map(accountSummary).sort((a, b) => b.id - a.id));
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
  res.json(accountSummary(account));
});

// ── MESAS ─────────────────────────────────────────────────────

app.get('/api/mesas', (req, res) => {
  const db = loadDB();
  const location = validLocation(req.query.location) || 'restaurante';
  res.json(db.mesas.filter(m => m.location_id === location).map(m => ({ ...m, total: mesaTotal(m) })));
});

app.post('/api/mesas/:id/open', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'libre') return res.status(409).json({ error: 'La mesa ya está abierta' });
  mesa.status   = 'ocupada';
  mesa.openedAt = new Date().toISOString();
  saveDB(db);
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
  sendMesa(res, mesa);
});

app.delete('/api/mesas/:id/items/:rowId', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada') return res.status(409).json({ error: 'No se puede modificar esta mesa' });
  mesa.items = mesa.items.filter(i => i.id !== Number(req.params.rowId));
  saveDB(db);
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/cobrar', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
  if (!mesa) return;
  if (mesa.status !== 'ocupada' || mesa.items.length === 0) return res.status(409).json({ error: 'La mesa no tiene un pedido para cobrar' });
  mesa.status = 'pagando';
  saveDB(db);
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
  sendMesa(res, mesa);
});

app.post('/api/mesas/:id/cerrar', (req, res) => {
  const db   = loadDB();
  const mesa = requireMesa(db, req.params.id, res);
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
    let account = null;
    if (paymentMethod === 'cuenta') {
      const accountType = String(req.body.account_type || '');
      const accountName = String(req.body.account_name || '').trim();
      const room = String(req.body.room || '').trim();
      if (!['habitacion','propietario','otro'].includes(accountType)) return res.status(400).json({ error:'Selecciona el tipo de cuenta' });
      if (!accountName || accountName.length > 100) return res.status(400).json({ error:'Escribe el nombre del huésped o responsable' });
      if (accountType === 'habitacion' && (!room || room.length > 20)) return res.status(400).json({ error:'Escribe el número de habitación' });
      account = db.cuentas.map(accountSummary).filter(item => item.type === accountType &&
        item.name.toLowerCase() === accountName.toLowerCase() && (item.room || '') === room)
        .sort((a, b) => b.id - a.id)[0];
      if (!account) {
        account = { id:db._nextAccountId++, type:accountType, name:accountName, room,
          created_at:new Date().toISOString(), charges:[], payments:[], writeoffs:[] };
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
    db.ventas.push({
      id:      ventaId,
      mesa_id: mesa.id,
      mesa_numero: mesa.number,
      location_id: mesa.location_id,
      items:   [...mesa.items],
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      account_id: account?.id || null,
      collection_status: paymentMethod === 'cuenta' ? 'pendiente' : 'pagada',
      total,
      hora:  nowTime(),
      fecha: todayStr(),
    });
    if (account) account.charges.push({ id:db._nextAccountChargeId++, sale_id:ventaId,
      amount:total, fecha:todayStr(), hora:nowTime(), location_id:mesa.location_id, note:String(req.body.account_note || '').trim().slice(0,150) });
    for (const [itemId, quantity] of Object.entries(stockRequirements)) {
      db.movimientos_stock.push({
        id: db._nextStockMovementId++, item_id:itemId, type:'venta',
        quantity:-quantity, venta_id:ventaId, location_id:mesa.location_id, date:new Date().toISOString(), note:`Mesa ${mesa.number} · ${mesa.location_id}`,
      });
    }
  }
  mesa.status   = 'libre';
  mesa.openedAt = null;
  mesa.items    = [];
  saveDB(db);
  res.json({ ok: true });
});

// ── VENTAS ────────────────────────────────────────────────────

app.get('/api/ventas', (req, res) => {
  const db    = loadDB();
  const fecha = req.query.fecha || todayStr();
  const location = validLocation(req.query.location);
  res.json(db.ventas.filter(v => v.fecha === fecha && (!location || v.location_id === location)).reverse());
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
  report.ventas.forEach(v => detail.addRow({ id:v.id, location:v.location_id, fecha:v.fecha, hora:v.hora, mesa:`Mesa ${v.mesa_numero || v.mesa_id}`,
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
    num: i+1, mesa: `Mesa ${v.mesa_numero || v.mesa_id}`, hora: v.hora, payment:v.payment_method || 'efectivo', reference:v.payment_reference || '',
    items:    v.items.map(it => it.name + (it.qty > 1 ? ' x'+it.qty : '')).join(', '),
    total:    `$${v.total.toFixed(2)}`,
  }));

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
    .forEach(it => ws3.addRow({ name:it.name, qty:it.qty, rev:`$${it.rev.toFixed(2)}` }));

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
    amount:`$${movement.amount.toFixed(2)}`,
  });

  const ws5 = wb.addWorksheet('Cobros de cuentas');
  ws5.columns = [
    { header:'Hora', key:'hora', width:12 }, { header:'Cuenta', key:'account_name', width:28 },
    { header:'Forma de pago', key:'payment_method', width:18 },
    { header:'Nº comprobante', key:'payment_reference', width:20 }, { header:'Valor', key:'amount', width:14 },
  ];
  ws5.getRow(1).font = { bold:true, color:{ argb:'FFFFFFFF' } };
  ws5.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFBA7517' } };
  for (const payment of cierre.pagos_cuentas || []) ws5.addRow({ ...payment, amount:`$${payment.amount.toFixed(2)}` });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cierre_${cierre.fecha.replace(/\//g,'-')}_${cierre.hora.replace(':','-')}.xlsx"`);
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
    num: i+1, mesa: `Mesa ${v.mesa_numero || v.mesa_id}`, fecha: v.fecha, hora: v.hora, payment:v.payment_method || 'efectivo', reference:v.payment_reference || '',
    items:    v.items.map(it => it.name + (it.qty > 1 ? ' x'+it.qty : '')).join(', '),
    total:    `$${v.total.toFixed(2)}`,
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ventas_${location || 'general'}_${fecha.replace(/\//g,'-')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
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
