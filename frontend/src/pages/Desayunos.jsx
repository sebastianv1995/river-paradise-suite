import { useCallback, useEffect, useState } from 'react';

const money = value => '$' + Number(value || 0).toFixed(2);
const localISODate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación');
  return result;
}

export default function Desayunos({ location, user }) {
  const [date, setDate] = useState(localISODate());
  const [day, setDay] = useState(null);
  const [history, setHistory] = useState([]);
  const [price, setPrice] = useState('6');
  const [form, setForm] = useState({ room:'', guest_name:'', included:'2', note:'' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [current, previous] = await Promise.all([
      request(`/api/breakfasts?location=${location}&fecha=${date}`),
      request(`/api/breakfasts/history?location=${location}`),
    ]);
    setDay(current.day); setPrice(String(current.settings.unit_price)); setHistory(previous);
  }, [date, location]);

  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, [load]);
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.onmessage = event => {
      try { if (JSON.parse(event.data).type === 'breakfasts') load(); } catch { /* reconecta automáticamente */ }
    };
    return () => events.close();
  }, [load]);

  async function run(action, success='') {
    setSaving(true); setMessage('');
    try { await action(); if (success) setMessage(`✓ ${success}`); await load(); }
    catch (error) { setMessage(`Error: ${error.message}`); }
    finally { setSaving(false); }
  }

  function openDay() {
    run(() => request('/api/breakfasts/open', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ location_id:location, fecha:date }) }), 'Registro del desayuno abierto');
  }

  function savePrice(event) {
    event.preventDefault();
    run(() => request('/api/breakfasts/settings', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ unit_price:Number(price) }) }), 'Valor para próximos registros actualizado');
  }

  function addEntry(event) {
    event.preventDefault();
    run(async () => {
      let current = day;
      if (!current) current = await request('/api/breakfasts/open', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ location_id:location, fecha:date }) });
      await request(`/api/breakfasts/${current.id}/entries`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ ...form, included:Number(form.included) }) });
      setForm({ room:'', guest_name:'', included:'2', note:'' });
    }, 'Habitación agregada');
  }

  function changeServed(entry, delta) {
    run(() => request(`/api/breakfasts/${day.id}/entries/${entry.id}/served`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ delta }) }));
  }

  function adjustIncluded(entry) {
    const answer = window.prompt(`Desayunos incluidos para la habitación ${entry.room}:`, String(entry.included));
    if (answer === null) return;
    const included = Number(answer);
    run(() => request(`/api/breakfasts/${day.id}/entries/${entry.id}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ ...entry, included }) }), 'Desayunos incluidos corregidos');
  }

  function removeEntry(entry) {
    if (!window.confirm(`¿Eliminar la habitación ${entry.room} del registro?`)) return;
    run(() => request(`/api/breakfasts/${day.id}/entries/${entry.id}`, { method:'DELETE' }), 'Habitación eliminada');
  }

  function closeDay() {
    if (!window.confirm('¿Finalizar el desayuno? Después solo un administrador podrá reabrirlo.')) return;
    run(() => request(`/api/breakfasts/${day.id}/close`, { method:'POST' }), 'Desayuno del día finalizado');
  }

  function reopenDay() { run(() => request(`/api/breakfasts/${day.id}/reopen`, { method:'POST' }), 'Registro reabierto'); }
  function settleDay(settled) {
    run(() => request(`/api/breakfasts/${day.id}/settle`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ settled }) }), settled ? 'Devolución marcada como recibida' : 'Devolución marcada como pendiente');
  }

  const open = day?.status === 'abierto';
  return <div className="page-container breakfast-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:1050 }}>
    <div className="breakfast-heading">
      <div><h2>Desayunos de huéspedes</h2><p>Control independiente de ventas y cierre de caja.</p></div>
      <label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
    </div>

    {message && <div className={`account-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</div>}

    {user.role === 'admin' && <form className="breakfast-price" onSubmit={savePrice}>
      <div><b>Valor reconocido por desayuno</b><small>Se aplicará a las habitaciones que agregues después del cambio.</small></div>
      <span>$</span><input type="number" min="0.01" max="100" step="0.01" value={price} onChange={event => setPrice(event.target.value)}/>
      <button disabled={saving}>Guardar valor</button>
    </form>}

    {!day ? <section className="breakfast-empty"><span>☀</span><h3>No hay desayuno abierto para esta fecha</h3><button onClick={openDay} disabled={saving}>Abrir desayuno del día</button></section> : <>
      <div className="breakfast-statusbar">
        <div><b>{day.status === 'abierto' ? 'Registro abierto' : 'Desayuno finalizado'}</b><small>{day.settlement_status === 'devuelto' ? 'Devolución recibida' : 'Devolución pendiente'}</small></div>
        <div className="breakfast-status-actions"><a href={`/api/breakfasts/${day.id}/export`}>↓ Descargar Excel</a>{open && <button onClick={closeDay} disabled={saving}>Finalizar desayuno</button>}{!open && user.role === 'admin' && <button className="secondary" onClick={reopenDay}>Reabrir</button>}</div>
      </div>

      <div className="breakfast-totals">
        <Metric label="Incluidos" value={day.totals.included}/><Metric label="Servidos" value={day.totals.served}/>
        <Metric label="No consumidos" value={day.totals.unused}/><Metric label="Adicionales" value={day.totals.additional} alert={day.totals.additional > 0}/>
        <Metric label="A devolver" value={money(day.totals.reimbursement)} moneyValue/>
      </div>

      {open && <form className="breakfast-add" onSubmit={addEntry}>
        <h3>Agregar habitación</h3>
        <label>Habitación<input required maxLength="20" value={form.room} onChange={event => setForm({ ...form, room:event.target.value })} placeholder="Ej. 5"/></label>
        <label>Huésped responsable<input required maxLength="100" value={form.guest_name} onChange={event => setForm({ ...form, guest_name:event.target.value })} placeholder="Nombre completo"/></label>
        <label>Desayunos incluidos<input required type="number" min="1" max="50" value={form.included} onChange={event => setForm({ ...form, included:event.target.value })}/></label>
        <label>Observación<input maxLength="180" value={form.note} onChange={event => setForm({ ...form, note:event.target.value })} placeholder="Opcional"/></label>
        <button disabled={saving}>+ Agregar</button>
      </form>}

      <section className="breakfast-list">
        <h3>Habitaciones registradas</h3>
        {!day.entries.length ? <p className="breakfast-none">Todavía no se han registrado habitaciones.</p> : day.entries.map(entry => <article className="breakfast-entry" key={entry.id}>
          <div className="breakfast-room"><b>Hab. {entry.room}</b><span>{entry.guest_name}</span>{entry.note && <small>{entry.note}</small>}</div>
          <div className="breakfast-count"><small>Incluidos</small><strong>{entry.included}</strong>{user.role === 'admin' && <button onClick={() => adjustIncluded(entry)}>Modificar</button>}</div>
          <div className="breakfast-served"><small>Servidos</small><div><button disabled={!open || saving || entry.served === 0} onClick={() => changeServed(entry, -1)}>−</button><strong>{entry.served}</strong><button disabled={!open || saving} onClick={() => changeServed(entry, 1)}>+</button></div></div>
          <div className="breakfast-difference"><small>Diferencia</small><strong className={entry.additional ? 'extra' : ''}>{entry.additional ? `+${entry.additional} adicional(es)` : entry.unused ? `${entry.unused} no consumido(s)` : 'Completo'}</strong></div>
          <div className="breakfast-reimbursement"><small>A devolver</small><strong>{money(entry.reimbursement)}</strong>{user.role === 'admin' && <button className="remove" onClick={() => removeEntry(entry)}>Eliminar</button>}</div>
        </article>)}
      </section>

      {!open && user.role === 'admin' && <div className="breakfast-settlement"><div><b>Devolución de contabilidad</b><span>{day.settlement_status === 'devuelto' ? `Recibida · ${money(day.totals.reimbursement)}` : `Pendiente · ${money(day.totals.reimbursement)}`}</span></div><button onClick={() => settleDay(day.settlement_status !== 'devuelto')}>{day.settlement_status === 'devuelto' ? 'Marcar pendiente' : 'Marcar como devuelto'}</button></div>}
    </>}

    {!!history.length && <section className="breakfast-history"><h3>Historial reciente</h3>{history.slice(0, 10).map(item => <button key={item.id} onClick={() => { const [d,m,y] = item.fecha.split('/'); setDate(`${y}-${m}-${d}`); }}><span><b>{item.fecha}</b><small>{item.status} · {item.totals.included} incluidos / {item.totals.served} servidos</small></span><strong>{money(item.totals.reimbursement)}</strong></button>)}</section>}
  </div>;
}

function Metric({ label, value, alert, moneyValue }) {
  return <div className={alert ? 'alert' : moneyValue ? 'money' : ''}><small>{label}</small><strong>{value}</strong></div>;
}
