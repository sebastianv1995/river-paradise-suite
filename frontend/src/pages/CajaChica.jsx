import { useEffect, useState } from 'react';

const money = value => '$' + Number(value).toFixed(2);

export default function CajaChica({ location }) {
  const [movements, setMovements] = useState([]);
  const [type, setType] = useState('egreso');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch(`/api/cash-movements?location=${location}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo cargar la caja chica');
    setMovements(result);
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

  const incomes = movements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
  const expenses = movements.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);

  return <div className="page-container cash-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:850 }}>
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:18, fontWeight:600 }}>Caja chica</div>
      <div style={{ fontSize:12, color:'var(--text2)' }}>Registra el efectivo que entra o sale de caja fuera de las ventas.</div>
    </div>

    {message && <div style={{ padding:'9px 12px', borderRadius:8, marginBottom:12, fontSize:13,
      background:message.startsWith('Error') ? 'var(--coral-light)' : 'var(--green-light)',
      color:message.startsWith('Error') ? 'var(--coral)' : 'var(--green-dark)' }}>{message}</div>}

    <div className="summary-grid">
      <Summary label="Ingresos adicionales" value={incomes} color="var(--green)" />
      <Summary label="Egresos / gastos" value={expenses} color="var(--coral)" />
      <Summary label="Movimiento neto" value={incomes - expenses} color={incomes - expenses >= 0 ? 'var(--green)' : 'var(--coral)'} />
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
