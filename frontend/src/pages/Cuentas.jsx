import { useEffect, useState } from 'react';

const money = value => '$' + Number(value || 0).toFixed(2);
const typeLabel = { habitacion:'Huésped', propietario:'Propietario', otro:'Otro autorizado' };

export default function Cuentas({ location }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [reference, setReference] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState({});
  const [addingConsumption, setAddingConsumption] = useState(false);
  const [cart, setCart] = useState({});

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
        if (JSON.parse(event.data).type === 'menu') fetch('/api/menu').then(response => response.json()).then(setMenu).catch(console.error);
      } catch (error) { console.error('No se pudo actualizar la carta', error); }
    };
    const refreshMenu = () => fetch('/api/menu').then(response => response.json()).then(setMenu).catch(console.error);
    const interval = window.setInterval(refreshMenu, 3000);
    return () => { events.close(); window.clearInterval(interval); };
  }, []);

  const visible = accounts.filter(account => showClosed || account.balance > 0);
  const selected = accounts.find(account => account.id === selectedId);
  const pendingTotal = accounts.reduce((sum, account) => sum + account.balance, 0);

  function open(account) {
    setSelectedId(account.id); setAmount(account.balance.toFixed(2)); setMessage('');
    setReference(''); setInternalNote(''); setAddingConsumption(false); setCart({});
  }

  function changeCart(item, delta) {
    setCart(current => {
      const next = Math.max(0, (current[item.id] || 0) + delta);
      if (!next) { const copy = { ...current }; delete copy[item.id]; return copy; }
      return { ...current, [item.id]:next };
    });
  }

  async function saveConsumption() {
    const items = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty }));
    if (!items.length) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/accounts/${selected.id}/charges`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ items, location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo agregar el consumo');
      setMessage('✓ Consumo agregado a la cuenta'); setCart({}); setAddingConsumption(false); await load();
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
      setMessage('✓ Pago registrado correctamente'); await load();
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

  return <div className="page-container accounts-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:1050 }}>
    <div className="accounts-header"><div><div style={{ fontSize:18, fontWeight:600 }}>Cuentas pendientes</div><div style={{ fontSize:12, color:'var(--text2)' }}>Huéspedes, propietarios y personas autorizadas.</div></div><div className="pending-total"><span>Total pendiente</span><strong>{money(pendingTotal)}</strong></div></div>
    {message && <div className={`account-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</div>}
    <div className="account-toolbar">
      <button className={!showClosed ? 'active' : ''} onClick={() => setShowClosed(false)}>Pendientes</button>
      <button className={showClosed ? 'active' : ''} onClick={() => setShowClosed(true)}>Ver todas</button>
      <a href="/api/export/accounts-pending/all" style={{ marginLeft:'auto', padding:'7px 12px', borderRadius:8, background:'var(--green)', color:'#fff', textDecoration:'none', fontSize:12, fontWeight:600 }}>
        Descargar todas las pendientes
      </a>
    </div>

    <div className="accounts-layout">
      <div className="account-list">
        {!visible.length ? <div className="account-empty">No hay cuentas {showClosed ? 'registradas' : 'pendientes'}.</div> : visible.map(account => <button className={`account-card ${selectedId === account.id ? 'selected' : ''}`} key={account.id} onClick={() => open(account)}>
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
            {selected.balance > 0 && <button className="pay-account" style={{ flex:1, width:'auto', marginTop:0 }} onClick={() => { setAddingConsumption(value => !value); setCart({}); }}>
              {addingConsumption ? 'Cerrar carta' : '+ Agregar consumo'}
            </button>}
            <a href={`/api/export/accounts/${selected.id}`} style={{ flex:1, display:'grid', placeItems:'center', border:'1px solid var(--green)', borderRadius:8, color:'var(--green)', textDecoration:'none', fontSize:12, fontWeight:600 }}>
              Descargar estado de cuenta
            </a>
          </div>
          {addingConsumption && <div style={{ border:'1px solid var(--border)', borderRadius:10, padding:10, maxHeight:330, overflowY:'auto', marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:8 }}>Selecciona los productos consumidos. Se cargarán a la habitación sin registrar un pago.</div>
            {Object.entries(menu).map(([category, products]) => <div key={category} style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--amber)', textTransform:'uppercase', marginBottom:4 }}>{category}</div>
              {products.map(item => <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', gap:8, padding:'5px 3px', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12 }}>{item.name}<small style={{ display:'block', color:'var(--text3)' }}>{money(item.price)}</small></span>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <button disabled={!cart[item.id]} onClick={() => changeCart(item, -1)} style={smallButton}>−</button><b style={{ minWidth:18, textAlign:'center' }}>{cart[item.id] || 0}</b>
                  <button disabled={item.price <= 0} title={item.price <= 0 ? 'Configura el precio en Carta' : ''} onClick={() => changeCart(item, 1)} style={smallButton}>+</button>
                </div>
                <strong style={{ minWidth:55, textAlign:'right', fontSize:12 }}>{money((cart[item.id] || 0) * item.price)}</strong>
              </div>)}
            </div>)}
            <div style={{ position:'sticky', bottom:0, background:'#fff', paddingTop:8 }}>
              <button className="pay-account" disabled={saving || !Object.keys(cart).length} onClick={saveConsumption}>
                Confirmar consumo · {money(Object.entries(cart).reduce((sum, [id, qty]) => sum + (Object.values(menu).flat().find(item => item.id === id)?.price || 0) * qty, 0))}
              </button>
            </div>
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
          {[...(selected.charges || [])].reverse().map(charge => <div className="account-history-row" key={charge.id}><span><b>{charge.fecha}</b><small>{charge.hora}{charge.location_id ? ` · ${charge.location_id}` : ''}{charge.note ? ` · ${charge.note}` : ''}</small>
            {!!charge.items?.length && <small style={{ color:'var(--text2)', marginTop:3 }}>{charge.items.map(item => `${item.qty} ${item.name}`).join(', ')}</small>}
          </span><strong>{money(charge.amount)}</strong></div>)}
          {!!selected.payments?.length && <><h3>Pagos</h3>{[...selected.payments].reverse().map(payment => <div className="account-history-row payment" key={payment.id}><span><b style={{ textTransform:'capitalize' }}>{payment.payment_method}</b><small>{payment.fecha} · {payment.hora}{payment.payment_reference ? ` · Comp. ${payment.payment_reference}` : ''}</small></span><strong>−{money(payment.amount)}</strong></div>)}</>}
        </>}
      </div>
    </div>
  </div>;
}

const smallButton = { width:24, height:24, border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer' };
