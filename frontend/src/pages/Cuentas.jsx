import { useEffect, useState } from 'react';

const money = value => '$' + Number(value || 0).toFixed(2);
const typeLabel = { habitacion:'Huésped', propietario:'Propietario', otro:'Otro autorizado' };

export default function Cuentas({ location, user }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [reference, setReference] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState({});
  const [addingConsumption, setAddingConsumption] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');

  async function load() {
    const [response, menuResponse] = await Promise.all([fetch('/api/accounts'), fetch('/api/menu')]);
    const result = await response.json();
    if (!response.ok || !menuResponse.ok) throw new Error(result.error || 'No se pudieron cargar las cuentas');
    setAccounts(result); setMenu(await menuResponse.json());
  }
  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, []);
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.onmessage = event => {
      try {
        const update = JSON.parse(event.data);
        if (update.type === 'menu') fetch('/api/menu').then(response => response.json()).then(setMenu).catch(console.error);
        if (update.type === 'accounts') load().catch(console.error);
      } catch (error) { console.error('No se pudo actualizar la carta', error); }
    };
    const refreshMenu = () => fetch('/api/menu').then(response => response.json()).then(setMenu).catch(console.error);
    const interval = window.setInterval(refreshMenu, 3000);
    return () => { events.close(); window.clearInterval(interval); };
  }, []);

  const visible = accounts.filter(account => account.status !== 'anulada' && account.balance > 0);
  const selected = accounts.find(account => account.id === selectedId);
  const pendingTotal = visible.reduce((sum, account) => sum + account.balance, 0);
  const consumptionRows = selected ? Object.values((selected.charges || []).reduce((groups, charge) => {
    if (charge.status === 'anulado') return groups;
    for (const item of charge.items || []) {
      if (item.status === 'anulado') continue;
      const row = groups[item.item_id] ||= { ...item, quantity:0, entries:[] };
      row.quantity += item.qty;
      row.entries.push({ charge, item });
    }
    return groups;
  }, {})) : [];

  function open(account) {
    setSelectedId(account.id); setAmount(account.balance.toFixed(2)); setMessage('');
    setReference(''); setInternalNote(''); setAddingConsumption(false); setMenuSearch('');
  }

  async function addConsumption(item) {
    if (item.price <= 0 || saving) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/charges`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ items:[{ item_id:item.id, qty:1 }], location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo agregar el consumo');
      setMessage(`✓ ${item.name} agregado a la cuenta`); await load();
      setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function registerPayment() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/payments`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ amount:Number(amount), payment_method:method, payment_reference:reference, location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el pago');
      setMessage(result.receipt_queued ? '✓ Cuenta cerrada y comprobante enviado a impresión' : '✓ Pago parcial registrado; la cuenta continúa abierta'); await load();
      if (result.balance === 0) setSelectedId(null); else setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function convertInternal() {
    if (!internalNote.trim()) return setMessage('Error: escribe el motivo del consumo interno');
    if (!window.confirm(`¿Registrar ${money(amount)} como consumo interno? Esta acción no representa un cobro.`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/internal`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ amount:Number(amount), note:internalNote, location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el consumo interno');
      setMessage('✓ Consumo interno registrado'); await load();
      if (result.balance === 0) setSelectedId(null); else setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function cancelAccount() {
    if (!window.confirm(`¿Anular la cuenta completa de ${selected.name}? Se eliminarán TODOS sus consumos pendientes, el saldo quedará en cero y el inventario será restituido.`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/cancel`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ reason:'Anulación completa realizada desde Cuentas' }),
      });
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json') ? await response.json() : { error:'El servidor necesita reiniciarse para aplicar esta función' };
      if (!response.ok) throw new Error(result.error || 'No se pudo anular el consumo');
      setMessage(`✓ Cuenta completa de ${selected.name} anulada; todos los consumos fueron eliminados y el inventario fue restituido`);
      await load(); setSelectedId(null);
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function cancelItem(charge, item) {
    const reason = window.prompt(`Motivo para quitar ${item.qty} × ${item.name}:`);
    if (reason === null) return;
    if (!reason.trim()) return setMessage('Error: escribe el motivo de la anulación');
    if (!window.confirm(`¿Quitar ${item.name} completo de esta cuenta?`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/charges/${charge.id}/items/${item.id}/cancel`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ reason }),
      });
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json') ? await response.json() : { error:'El servidor necesita reiniciarse para aplicar esta función' };
      if (!response.ok) throw new Error(result.error || 'No se pudo quitar el producto');
      setMessage(`✓ ${item.name} fue anulado y su inventario restituido`);
      await load();
      if (result.balance === 0) setSelectedId(null); else setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function decrementItem(charge, item) {
    if (!window.confirm(`¿Retirar una unidad de ${item.name}?`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/charges/${charge.id}/items/${item.id}/cancel`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ reason:'Ajuste de cantidad desde la cuenta', quantity:1 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo disminuir la cantidad');
      setMessage(`✓ Se retiró una unidad de ${item.name}`);
      await load();
      if (result.balance === 0) setSelectedId(null); else setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function cancelProduct(row) {
    const reason = window.prompt(`Motivo para eliminar las ${row.quantity} unidades de ${row.name}:`);
    if (reason === null) return;
    if (!reason.trim()) return setMessage('Error: escribe el motivo de la anulación');
    if (!window.confirm(`¿Eliminar todo ${row.name} de esta cuenta?`)) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/items/${row.item_id}/cancel`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el producto');
      setMessage(`✓ Se eliminaron ${row.quantity} unidades de ${row.name}`);
      await load();
      if (result.balance === 0) setSelectedId(null); else setAmount(result.balance.toFixed(2));
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  return <div className="page-container accounts-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:1050 }}>
    <div className="accounts-header"><div><div style={{ fontSize:18, fontWeight:600 }}>Cuentas pendientes</div><div style={{ fontSize:12, color:'var(--text2)' }}>Huéspedes, propietarios y personas autorizadas.</div></div><div className="pending-total"><span>Total pendiente</span><strong>{money(pendingTotal)}</strong></div></div>
    {message && <div className={`account-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</div>}
    <div className="account-toolbar">
      <button className="active">Pendientes</button>
      <a href="/api/export/accounts-pending/all" style={{ marginLeft:'auto', padding:'7px 12px', borderRadius:8, background:'var(--green)', color:'#fff', textDecoration:'none', fontSize:12, fontWeight:600 }}>
        Descargar todas las pendientes
      </a>
    </div>

    <div className="accounts-layout">
      <div className="account-list">
        {!visible.length ? <div className="account-empty">No hay cuentas pendientes.</div> : visible.map(account => <button className={`account-card ${selectedId === account.id ? 'selected' : ''}`} key={account.id} onClick={() => open(account)}>
          <span className="account-avatar">{account.type === 'habitacion' ? '⌂' : account.type === 'propietario' ? '★' : '○'}</span>
          <span className="account-info"><strong>{account.name}</strong><small>{typeLabel[account.type]}{account.room ? ` · Hab. ${account.room}` : ''}</small></span>
          <span className="account-balance"><strong>{money(account.balance)}</strong><small>{account.balance > 0 ? 'pendiente' : 'saldada'}</small></span>
        </button>)}
      </div>

      <div className="account-detail">
        {!selected ? <div className="account-empty">Selecciona una cuenta para consultar consumos o registrar un pago.</div> : <>
          <div className="account-detail-title"><div><strong>{selected.name}</strong><small>{typeLabel[selected.type]}{selected.room ? ` · Habitación ${selected.room}` : ''}</small></div><strong>{money(selected.balance)}</strong></div>
          <div className="account-totals"><span>Cargado <b>{money(selected.charged)}</b></span><span>Pagado <b>{money(selected.paid)}</b></span><span>Interno <b>{money(selected.internal)}</b></span></div>
          <div style={{ display:'flex', gap:8, margin:'10px 0' }}>
            {selected.balance > 0 && <button className="pay-account" style={{ flex:1, width:'auto', marginTop:0 }} onClick={() => setAddingConsumption(value => !value)}>
              {addingConsumption ? 'Cerrar carta' : '+ Agregar consumo'}
            </button>}
            <a href={`/api/export/accounts/${selected.id}`} style={{ flex:1, display:'grid', placeItems:'center', border:'1px solid var(--green)', borderRadius:8, color:'var(--green)', textDecoration:'none', fontSize:12, fontWeight:600 }}>
              Descargar estado de cuenta
            </a>
          </div>
          {selected.balance > 0 && user?.role === 'admin' && <button disabled={saving} onClick={cancelAccount} style={{ width:'100%', margin:'0 0 10px', border:'1px solid var(--coral)', borderRadius:8, background:'#fff', color:'var(--coral)', padding:'8px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Anular cuenta completa
          </button>}
          {addingConsumption && <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:10, maxHeight:330, overflowY:'auto', marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>Pulsa un producto para cargar una unidad directamente a esta cuenta.</div>
            <input type="search" value={menuSearch} onChange={event => setMenuSearch(event.target.value)} placeholder="Buscar producto" aria-label="Buscar producto para agregar a la cuenta" style={{ width:'100%', marginBottom:9, border:'1px solid var(--border)', borderRadius:7, padding:'7px 9px', fontSize:12 }} />
            {Object.entries(menu).map(([category, products]) => {
              const filteredProducts = products.filter(item => `${item.name} ${item.desc || ''}`.toLocaleLowerCase().includes(menuSearch.trim().toLocaleLowerCase()));
              if (!filteredProducts.length) return null;
              return <div key={category} style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--amber)', textTransform:'uppercase', marginBottom:4 }}>{category}</div>
              {filteredProducts.map(item => <button key={item.id} type="button" disabled={saving || item.price <= 0} onClick={() => addConsumption(item)} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 5px', border:0, borderBottom:'1px solid var(--border)', background:'transparent', textAlign:'left', cursor:saving || item.price <= 0 ? 'not-allowed' : 'pointer', opacity:item.price <= 0 ? .55 : 1 }}>
                <span style={{ flex:1, fontSize:12 }}>{item.name}<small style={{ display:'block', color:'var(--text3)' }}>{item.price > 0 ? money(item.price) : 'Configura el precio en Carta'}</small></span>
                <strong style={{ color:'var(--green)', fontSize:12 }}>Agregar</strong>
              </button>)}
            </div>;
            })}
          </div>}
          {selected.balance > 0 && <div className="account-actions">
            <label><span>Valor a resolver</span><input type="number" min="0.01" max={selected.balance} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <div className="account-payment-methods">{['efectivo','tarjeta','transferencia'].map(value => <button key={value} className={method === value ? 'active' : ''} onClick={() => setMethod(value)}>{value}</button>)}</div>
            {method !== 'efectivo' && <input className="account-reference" value={reference} maxLength={80} onChange={e => setReference(e.target.value)} placeholder="Nº comprobante (opcional)" />}
            <button className="pay-account" disabled={saving || !Number(amount)} onClick={registerPayment}>Registrar pago</button>
            <div className="internal-divider"><span>o registrar sin cobro</span></div>
            <input className="account-reference" value={internalNote} maxLength={150} onChange={e => setInternalNote(e.target.value)} placeholder="Motivo del consumo interno" />
            <button className="internal-account" disabled={saving || !Number(amount) || !internalNote.trim()} onClick={convertInternal}>Convertir en consumo interno</button>
          </div>}
          <h3>Consumos</h3>
          {!consumptionRows.length ? <div style={{ padding:'10px 0', color:'var(--text3)', fontSize:12 }}>No hay productos activos en esta cuenta.</div> : <div style={{ borderTop:'1px solid var(--border)' }}>
            {consumptionRows.map(row => {
              const latest = row.entries[row.entries.length - 1];
              const product = Object.values(menu).flat().find(item => item.id === row.item_id) || row;
              return <div key={row.item_id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 3px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:13, fontWeight:500 }}>{row.name}</div><div style={{ fontSize:11, color:'var(--text3)' }}>{money(row.price)} c/u</div></div>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  {user?.role === 'admin' && <button title="Retirar una unidad" aria-label={`Restar ${row.name}`} disabled={saving} onClick={() => decrementItem(latest.charge, latest.item)} style={accountQtyButton}>{'−'}</button>}
                  <strong style={{ minWidth:18, textAlign:'center', fontSize:13 }}>{row.quantity}</strong>
                  <button title="Agregar una unidad" aria-label={`Agregar ${row.name}`} disabled={saving || product.price <= 0} onClick={() => addConsumption(product)} style={accountQtyButton}>+</button>
                </div>
                <strong style={{ minWidth:58, textAlign:'right', fontSize:13 }}>{money(row.quantity * row.price)}</strong>
                {user?.role === 'admin' && <button title="Eliminar todas las unidades de este producto" aria-label={`Eliminar todo ${row.name}`} disabled={saving} onClick={() => cancelProduct(row)} style={accountTrashButton}>🗑</button>}
              </div>;
            })}
          </div>}
          {!!selected.payments?.length && <><h3>Pagos</h3>{[...selected.payments].reverse().map(payment => <div className="account-history-row payment" key={payment.id}><span><b style={{ textTransform:'capitalize' }}>{payment.payment_method}</b><small>{payment.fecha} · {payment.hora}{payment.payment_reference ? ` · Comp. ${payment.payment_reference}` : ''}</small></span><strong>−{money(payment.amount)}</strong></div>)}</>}
        </>}
      </div>
    </div>
  </div>;
}

const accountQtyButton = { width:30, height:30, border:'1px solid var(--border)', borderRadius:8, background:'#fff', color:'var(--text2)', fontSize:17, lineHeight:1 };
const accountTrashButton = { width:24, height:24, border:0, borderRadius:6, background:'transparent', color:'var(--text3)', fontSize:16, lineHeight:1 };
