import { useEffect, useState } from 'react';

const money = value => '$' + Number(value || 0).toFixed(2);
const inputDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

function rangeFor(type) {
  const today = new Date();
  if (type === 'today') return [inputDate(today), inputDate(today)];
  if (type === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [inputDate(start), inputDate(today)];
  }
  return [inputDate(new Date(today.getFullYear(), today.getMonth(), 1)), inputDate(today)];
}

export default function Reportes({ initialLocation='restaurante' }) {
  const initial = rangeFor('month');
  const [from, setFrom] = useState(initial[0]);
  const [to, setTo] = useState(initial[1]);
  const [report, setReport] = useState(null);
  const [location, setLocation] = useState(initialLocation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(start=from, end=to) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/reports?from=${start}&to=${end}&location=${location}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el reporte');
      setReport(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(initial[0], initial[1]); }, []);

  function preset(type) {
    const [start, end] = rangeFor(type);
    setFrom(start); setTo(end); load(start, end);
  }

  const maxDay = Math.max(...(report?.days || []).map(day => day.total), 1);

  return <div className="page-container reports-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:1100 }}>
    <div className="reports-heading">
      <div><div style={{ fontSize:18, fontWeight:600 }}>Reportes generales</div><div style={{ fontSize:12, color:'var(--text2)' }}>Consulta y exporta cualquier período.</div></div>
      {report && <a className="export-report" href={`/api/export/report?from=${from}&to=${to}&location=${location}`}>⬇ Exportar Excel</a>}
    </div>

    <div className="report-filters">
      <div className="preset-buttons"><button onClick={() => preset('today')}>Hoy</button><button onClick={() => preset('week')}>Esta semana</button><button onClick={() => preset('month')}>Este mes</button></div>
      <label><span>Local</span><select value={location} onChange={e => setLocation(e.target.value)}><option value="all">Consolidado</option><option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option></select></label>
      <label><span>Desde</span><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label>
      <label><span>Hasta</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}/></label>
      <button className="generate-report" onClick={() => load()} disabled={loading || !from || !to || from > to}>{loading ? 'Consultando…' : 'Consultar'}</button>
    </div>

    {error && <div style={{ padding:10, borderRadius:8, background:'var(--coral-light)', color:'var(--coral)', marginBottom:12 }}>{error}</div>}
    {report && <>
      <div className="report-summary">
        <ReportCard label="Total vendido" value={money(report.summary.total)} tone="green" />
        <ReportCard label="Número de ventas" value={report.summary.sales_count} />
        <ReportCard label="Promedio por venta" value={money(report.summary.sales_count ? report.summary.total/report.summary.sales_count : 0)} />
        <ReportCard label="Unidades vendidas" value={report.products.reduce((sum, product) => sum + product.quantity, 0)} />
      </div>

      {report.location === 'all' && <div className="location-comparison">
        <div><span>Restaurante</span><strong>{money(report.locations.restaurante.total)}</strong><small>{report.locations.restaurante.sales_count} ventas</small></div>
        <div><span>Cafetería</span><strong>{money(report.locations.cafeteria.total)}</strong><small>{report.locations.cafeteria.sales_count} ventas</small></div>
        <div className="consolidated"><span>Total organización</span><strong>{money(report.summary.total)}</strong><small>Reporte consolidado</small></div>
      </div>}

      <div className="report-columns">
        <section className="report-panel">
          <h3>Formas de pago</h3>
          <PaymentRow icon="💵" label="Efectivo" value={report.summary.efectivo} total={report.summary.total}/>
          <PaymentRow icon="💳" label="Tarjeta" value={report.summary.tarjeta} total={report.summary.total}/>
          <PaymentRow icon="↗" label="Transferencia" value={report.summary.transferencia} total={report.summary.total}/>
          <PaymentRow icon="⌂" label="Cargado a cuentas" value={report.summary.account_charges} total={report.summary.total}/>
          <div className="cash-report"><span>Cobros posteriores de cuentas</span><strong>{money(report.summary.account_payments)}</strong></div>
          <div className="cash-report" style={{ marginTop:5 }}><span>Consumo interno</span><strong>{money(report.summary.internal_consumption)}</strong></div>
          <div className="cash-report"><span>Caja chica neta</span><strong>{money(report.summary.cash_in - report.summary.cash_out)}</strong></div>
        </section>

        <section className="report-panel">
          <h3>Productos más vendidos</h3>
          {!report.products.length ? <Empty /> : report.products.slice(0,6).map((product, index) => <div className="top-report-row" key={product.id}>
            <span className="rank">{index+1}</span><span>{product.name}</span><small>{product.quantity} uds.</small><strong>{money(product.revenue)}</strong>
          </div>)}
        </section>
      </div>

      <section className="report-panel" style={{ marginTop:12 }}>
        <h3>Ventas por día</h3>
        {!report.days.length ? <Empty /> : <div className="daily-report-list">{report.days.map(day => <div className="daily-report-row" key={day.fecha}>
          <span>{day.fecha}</span><div className="daily-bar"><i style={{ width:`${day.total/maxDay*100}%` }}/></div><small>{day.ventas} ventas</small><strong>{money(day.total)}</strong>
        </div>)}</div>}
      </section>
    </>}
  </div>;
}

function ReportCard({ label, value, tone }) { return <div className="report-card"><span>{label}</span><strong className={tone || ''}>{value}</strong></div>; }
function PaymentRow({ icon, label, value, total }) { return <div className="payment-report-row"><span>{icon} {label}</span><div><i style={{ width:`${total ? value/total*100 : 0}%` }}/></div><strong>{money(value)}</strong></div>; }
function Empty() { return <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:12 }}>No hay ventas en este período.</div>; }
