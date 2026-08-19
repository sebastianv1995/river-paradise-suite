import { useEffect, useState } from 'react';

const money = value => '$' + Number(value).toFixed(2);

export default function CajaChica({ location }) {
  const [movements, setMovements] = useState([]);
  const [type, setType] = useState('egreso');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [fund, setFund] = useState(200);
  const [fundInput, setFundInput] = useState('200');
  const [savingFund, setSavingFund] = useState(false);

  async function load() {
    const [movementsResponse, fundResponse] = await Promise.all([
      fetch(`/api/cash-movements?location=${location}`), fetch(`/api/cash-fund?location=${location}`),
    ]);
    const movementsResult = await movementsResponse.json();
    const fundResult = await fundResponse.json();
    if (!movementsResponse.ok || !fundResponse.ok) throw new Error(movementsResult.error || fundResult.error || 'No se pudo cargar la caja chica');
    setMovements(movementsResult);
    setFund(fundResult.amount);
    setFundInput(String(fundResult.amount));
  }

  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, [location]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/cash-movements', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ type, amount:Number(amount), concept, location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el movimiento');
      setAmount('');
      setConcept('');
      setMessage('✓ Movimiento registrado correctamente');
      await load();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveFund(event) {
    event.preventDefault();
    setSavingFund(true);
    setMessage('');
    try {
      const response = await fetch('/api/cash-fund', {
        method:'PUT', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ amount:Number(fundInput), location_id:location }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el fondo fijo');
      setFund(result.amount);
      setFundInput('');
      setMessage('✓ Fondo fijo actualizado');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSavingFund(false);
    }
  }

  const incomes = movements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
  const expenses = movements.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);
  const currentFund = Number(fund) + incomes - expenses;
  const amountToReplace = Math.max(0, Number(fund) - currentFund);

  return <div className="page-container cash-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:850 }}>
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:18, fontWeight:600 }}>Caja chica</div>
      <div style={{ fontSize:12, color:'var(--text2)' }}>Registra el efectivo que entra o sale de caja fuera de las ventas.</div>
    </div>

    {message && <div style={{ padding:'9px 12px', borderRadius:8, marginBottom:12, fontSize:13,
      background:message.startsWith('Error') ? 'var(--coral-light)' : 'var(--green-light)',
      color:message.startsWith('Error') ? 'var(--coral)' : 'var(--green-dark)' }}>{message}</div>}

    <div className="summary-grid">
      <Summary label="Fondo fijo" value={fund} color="var(--green)" />
      <Summary label="Saldo actual" value={currentFund} color={currentFund >= fund ? 'var(--green)' : 'var(--coral)'} />
      <Summary label="A reponer" value={amountToReplace} color={amountToReplace ? 'var(--coral)' : 'var(--green)'} />
    </div>

    <form onSubmit={saveFund} style={{ display:'flex', alignItems:'end', gap:8, padding:'12px 14px', marginBottom:12, background:'var(--green-light)', border:'1px solid rgba(0,51,102,.20)', borderRadius:10 }}>
      <label style={{ display:'flex', flexDirection:'column', gap:3, flex:1, fontSize:11, color:'var(--text2)', fontWeight:600 }}>
        Capital fijo de caja chica
        <input type="number" min="0" max="99999.99" step="0.01" value={fundInput} onChange={event => setFundInput(event.target.value)} style={{ width:'100%', border:'1px solid var(--border)', borderRadius:7, padding:'7px 8px', background:'#fff', fontSize:13 }} />
      </label>
      <button disabled={savingFund} style={{ height:34, padding:'0 12px', border:0, borderRadius:7, background:'var(--green)', color:'#fff', fontWeight:600, fontSize:11 }}>{savingFund ? 'Guardando…' : 'Guardar fondo'}</button>
    </form>

    <div style={{ padding:'9px 12px', marginBottom:12, borderRadius:8, background:'var(--green-light)', borderLeft:'3px solid var(--green)', color:'var(--green-dark)', fontSize:12 }}>
      El fondo fijo no es una venta. Los gastos lo reducen y el valor a reponer debe salir del efectivo de las ventas para volver al capital establecido.
    </div>

    <form onSubmit={submit} className="cash-form">
      <div style={{ fontWeight:600, marginBottom:3 }}>Nuevo movimiento</div>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:12 }}>Ejemplo: compra de hielo, transporte o efectivo agregado.</div>
      <div className="cash-type-selector">
        <button type="button" onClick={() => setType('egreso')} className={type === 'egreso' ? 'active expense' : ''}>− Egreso</button>
        <button type="button" onClick={() => setType('ingreso')} className={type === 'ingreso' ? 'active income' : ''}>+ Ingreso</button>
      </div>
      <div className="cash-fields">
        <label><span>Valor</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$0.00" required /></label>
        <label><span>Concepto</span><input maxLength={150} value={concept} onChange={e => setConcept(e.target.value)} placeholder="¿Por qué entró o salió dinero?" required /></label>
        <button disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</button>
      </div>
    </form>

    <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', margin:'20px 0 8px' }}>Movimientos de hoy</div>
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      {!movements.length ? <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:13 }}>No hay movimientos de caja chica hoy.</div> : movements.map(movement => (
        <div className="cash-movement-row" key={movement.id}>
          <div><div style={{ fontWeight:500 }}>{movement.concept}</div><div style={{ fontSize:11, color:'var(--text3)' }}>{movement.hora}</div></div>
          <span style={{ textTransform:'capitalize', color:'var(--text3)' }}>{movement.type}</span>
          <strong style={{ color:movement.type === 'ingreso' ? 'var(--green)' : 'var(--coral)' }}>{movement.type === 'ingreso' ? '+' : '−'}{money(movement.amount)}</strong>
        </div>
      ))}
    </div>
  </div>;
}

function Summary({ label, value, color }) {
  return <div className="summary-card"><div style={{ fontSize:11, color:'var(--text3)' }}>{label}</div><div style={{ fontSize:22, fontWeight:600, color }}>{money(value)}</div></div>;
}
