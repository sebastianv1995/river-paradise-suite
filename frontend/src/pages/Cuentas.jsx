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

  async function load() {
    const response = await fetch('/api/accounts');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las cuentas');
    setAccounts(result);
  }
  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, []);

  const visible = accounts.filter(account => showClosed || account.balance > 0);
  const selected = accounts.find(account => account.id === selectedId);
  const pendingTotal = accounts.reduce((sum, account) => sum + account.balance, 0);

  function open(account) {
    setSelectedId(account.id); setAmount(account.balance.toFixed(2)); setMessage('');
    setReference(''); setInternalNote('');
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
    <div className="account-toolbar"><button className={!showClosed ? 'active' : ''} onClick={() => setShowClosed(false)}>Pendientes</button><button className={showClosed ? 'active' : ''} onClick={() => setShowClosed(true)}>Ver todas</button></div>

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
          {[...(selected.charges || [])].reverse().map(charge => <div className="account-history-row" key={charge.id}><span><b>{charge.fecha}</b><small>{charge.hora}{charge.note ? ` · ${charge.note}` : ''}</small></span><strong>{money(charge.amount)}</strong></div>)}
          {!!selected.payments?.length && <><h3>Pagos</h3>{[...selected.payments].reverse().map(payment => <div className="account-history-row payment" key={payment.id}><span><b style={{ textTransform:'capitalize' }}>{payment.payment_method}</b><small>{payment.fecha} · {payment.hora}{payment.payment_reference ? ` · Comp. ${payment.payment_reference}` : ''}</small></span><strong>−{money(payment.amount)}</strong></div>)}</>}
        </>}
      </div>
    </div>
  </div>;
}
