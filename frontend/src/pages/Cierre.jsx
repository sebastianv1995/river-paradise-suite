import { useState, useEffect } from 'react';

const fmt = n => '$' + Number(n).toFixed(2);
const methodTotal = (ventas, method) => (ventas || [])
  .filter(v => (v.payment_method || 'efectivo') === method)
  .reduce((sum, v) => sum + v.total, 0);

// ── Historia de cierres ────────────────────────────────────────
function CierreDetalle({ cierre, onClose }) {
  const efectivo = cierre.total_efectivo ?? methodTotal(cierre.ventas, 'efectivo');
  const tarjeta = cierre.total_tarjeta ?? methodTotal(cierre.ventas, 'tarjeta');
  const transferencia = cierre.total_transferencia ?? methodTotal(cierre.ventas, 'transferencia');
  const topMap = {};
  for (const v of cierre.ventas || []) {
    for (const it of v.items || []) {
      if (!topMap[it.name]) topMap[it.name] = { name:it.name, qty:0, rev:0 };
      topMap[it.name].qty += it.qty;
      topMap[it.name].rev += it.price * it.qty;
    }
  }
  const top = Object.values(topMap).sort((a,b) => b.rev - a.rev).slice(0,5);
  const maxRev = top.length ? top[0].rev : 1;

  return (
    <div className="modal-overlay" style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.35)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:100,
    }}>
      <div className="closing-modal" style={{
        background:'#fff', borderRadius:16, width:520, maxHeight:'85vh',
        overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding:'16px 20px', borderBottom:`1px solid var(--border)`,
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <div style={{ fontWeight:600, fontSize:16 }}>Cierre del {cierre.fecha}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>Cerrado a las {cierre.hora}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <a href={`/api/export/cierre/${cierre.id}`} style={{
              padding:'6px 12px', borderRadius:8, border:`1px solid var(--border)`,
              fontSize:12, color:'var(--text2)', textDecoration:'none', fontWeight:500,
            }}>⬇ Excel</a>
            <button onClick={onClose} style={{
              width:30, height:30, borderRadius:8, border:`1px solid var(--border)`,
              background:'transparent', fontSize:16, cursor:'pointer',
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px 20px' }}>

          {/* Resumen */}
          <Section title="Resumen financiero">
            <InfoRow label="Número de ventas"   value={cierre.num_ventas} />
            <InfoRow label="Fondo inicial"       value={fmt(cierre.fondo_inicial)} />
            <InfoRow label="Total ventas"        value={fmt(cierre.total_ventas)} />
            <InfoRow label="Efectivo"            value={fmt(efectivo)} />
            <InfoRow label="Tarjeta"             value={fmt(tarjeta)} />
            <InfoRow label="Transferencia"       value={fmt(transferencia)} />
            <InfoRow label="Cargado a cuentas"  value={fmt(cierre.total_cuentas || 0)} />
            <InfoRow label="Cobros de cuentas"  value={fmt(cierre.total_cobros_cuentas || 0)} />
            <InfoRow label="Ingresos de caja chica" value={fmt(cierre.total_ingresos_caja || 0)} />
            <InfoRow label="Egresos de caja chica" value={fmt(cierre.total_egresos_caja || 0)} />
            <div style={{
              display:'flex', justifyContent:'space-between',
              padding:'10px 14px', background:'var(--green-light)',
              borderRadius:10, marginTop:8,
              fontWeight:600, fontSize:15, color:'var(--green-dark)',
            }}>
              <span>Total en caja</span><span>{fmt(cierre.total_caja)}</span>
            </div>
          </Section>

          {/* Top productos */}
          {top.length > 0 && (
            <Section title="Top productos">
              {top.map(it => (
                <div key={it.name} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:13 }}>
                  <span style={{ flex:1, color:'var(--text)' }}>{it.name}</span>
                  <div style={{ width:80, height:6, background:'var(--bg2)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ width: Math.round(it.rev/maxRev*100)+'%', height:'100%', background:'var(--amber-mid)', borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:'var(--text3)', minWidth:36, textAlign:'right' }}>{it.qty} uds</span>
                  <span style={{ fontWeight:500, color:'var(--amber)', minWidth:50, textAlign:'right' }}>{fmt(it.rev)}</span>
                </div>
              ))}
            </Section>
          )}

          {/* Detalle ventas */}
          <Section title={`Detalle de ventas (${cierre.ventas?.length})`}>
            {cierre.ventas?.map((v, i) => (
              <div key={v.id} style={{
                padding:'8px 12px', background:'var(--bg2)', borderRadius:8, marginBottom:6,
                display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{v.source === 'cuenta' ? `Cuenta · Hab. ${v.account_room || '-'}` : `Mesa ${v.mesa_numero || v.mesa_id}`} · <span style={{ textTransform:'capitalize' }}>{v.payment_method || 'efectivo'}</span>{v.payment_reference ? ` · Comp. ${v.payment_reference}` : ''}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>
                    {v.hora} · {v.items?.map(it => it.name+(it.qty>1?' x'+it.qty:'')).join(', ')}
                  </div>
                </div>
                <div style={{ fontWeight:600, color:'var(--green)', fontSize:14 }}>{fmt(v.total)}</div>
              </div>
            ))}
          </Section>

          {!!cierre.movimientos_caja?.length && <Section title="Movimientos de caja chica">
            {cierre.movimientos_caja.map(movement => <InfoRow key={movement.id}
              label={`${movement.type === 'ingreso' ? '+' : '−'} ${movement.concept}`}
              value={fmt(movement.amount)} />)}
          </Section>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        fontSize:11, fontWeight:600, color:'var(--text3)',
        textTransform:'uppercase', letterSpacing:'0.06em',
        marginBottom:10, paddingBottom:6, borderBottom:`1px solid var(--border)`,
      }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:`1px solid var(--border)` }}>
      <span style={{ color:'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight:500 }}>{value}</span>
    </div>
  );
}

// ── Cierre page ────────────────────────────────────────────────
export default function Cierre({ location }) {
  const [cierres,   setCierres]   = useState([]);
  const [ventas,    setVentas]    = useState([]);
  const [cashMovements, setCashMovements] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [fondo,     setFondo]     = useState('0.00');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [detalle,   setDetalle]   = useState(null);
  const [msg,       setMsg]       = useState('');

  const today = new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });

  async function load() {
    setLoading(true);
    const [c, v, cash, accountData] = await Promise.all([
      fetch(`/api/cierres?location=${location}`).then(r => r.json()),
      fetch(`/api/ventas?fecha=${encodeURIComponent(today)}&location=${location}`).then(r => r.json()),
      fetch(`/api/cash-movements?fecha=${encodeURIComponent(today)}&location=${location}`).then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
    ]);
    setCierres(c);
    setVentas(v);
    setCashMovements(cash);
    setAccounts(accountData);
    setLoading(false);
  }

  useEffect(() => { load(); }, [location]);

  async function doCierre() {
    if ((!ventas.length && !cashMovements.length && !accountPayments.length) || yaCerroHoy || saving) return;
    setSaving(true);
    const res  = await fetch('/api/cierres', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ fondo_inicial: parseFloat(fondo) || 0, location_id:location }),
    });
    if (res.ok) {
      setMsg('✅ Caja cerrada correctamente');
      await load();
    } else {
      const err = await res.json();
      setMsg('❌ ' + err.error);
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  }

  const totalVentas  = ventas.reduce((s, v) => s + v.total, 0);
  const accountPayments = accounts.flatMap(account => (account.payments || []).filter(payment => payment.fecha === today && payment.location_id === location && !payment.cierre_id));
  const paidAccountBy = method => accountPayments.filter(payment => payment.payment_method === method).reduce((sum, payment) => sum + payment.amount, 0);
  const totalEfectivo = methodTotal(ventas, 'efectivo') + paidAccountBy('efectivo');
  const totalTarjeta = methodTotal(ventas, 'tarjeta') + paidAccountBy('tarjeta');
  const totalTransferencia = methodTotal(ventas, 'transferencia') + paidAccountBy('transferencia');
  const totalCuentas = methodTotal(ventas, 'cuenta');
  const cashIncomes = cashMovements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0);
  const cashExpenses = cashMovements.filter(m => m.type === 'egreso').reduce((sum, m) => sum + m.amount, 0);
  const fondoNum     = parseFloat(fondo) || 0;
  const totalCaja    = fondoNum + totalEfectivo + cashIncomes - cashExpenses;
  const yaCerroHoy   = cierres.some(c => c.fecha === today);
  const hasActivity  = ventas.length > 0 || cashMovements.length > 0 || accountPayments.length > 0;

  const topMap = {};
  for (const v of ventas) for (const it of v.items||[]) {
    if (!topMap[it.name]) topMap[it.name] = { name:it.name, qty:0, rev:0 };
    topMap[it.name].qty += it.qty;
    topMap[it.name].rev += it.price * it.qty;
  }
  const top    = Object.values(topMap).sort((a,b) => b.rev - a.rev).slice(0,5);
  const maxRev = top.length ? top[0].rev : 1;

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text3)' }}>
      Cargando...
    </div>
  );

  return (
    <>
      {detalle && <CierreDetalle cierre={detalle} onClose={() => setDetalle(null)} />}

      <div className="closing-page" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:700 }}>

        {msg && (
          <div style={{
            padding:'10px 14px', borderRadius:10, marginBottom:14,
            background: msg.startsWith('✅') ? 'var(--green-light)' : '#FAECE7',
            color: msg.startsWith('✅') ? 'var(--green-dark)' : 'var(--coral)',
            fontSize:13, fontWeight:500,
          }}>{msg}</div>
        )}

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600 }}>Cierre de caja</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>{today}</div>
          </div>
          <button
            onClick={doCierre}
            disabled={!hasActivity || saving || yaCerroHoy}
            style={{
              padding:'9px 20px', borderRadius:8, border:'none',
              background: !hasActivity || yaCerroHoy ? 'var(--bg2)' : '#D85A30',
              color: !hasActivity || yaCerroHoy ? 'var(--text3)' : '#fff',
              fontSize:13, fontWeight:500,
              cursor: !hasActivity || yaCerroHoy ? 'not-allowed' : 'pointer',
            }}
          >
            🔒 {saving ? 'Cerrando...' : yaCerroHoy ? 'Caja cerrada' : 'Cerrar caja'}
          </button>
        </div>

        {/* Fondo inicial */}
        <Card icon="💰" title="Fondo inicial de caja">
          <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
            <span style={{ color:'var(--text2)' }}>Efectivo al inicio del día:</span>
            <span style={{ color:'var(--text2)' }}>$</span>
            <input
              type="number" min="0" step="0.50" value={fondo}
              onChange={e => setFondo(e.target.value)}
              style={{
                border:`1px solid var(--border)`, borderRadius:8,
                padding:'6px 10px', fontSize:13, width:110,
                background:'#fff', color:'var(--text)',
              }}
            />
          </div>
        </Card>

        {/* Resumen */}
        <Card icon="📊" title="Resumen del día">
          {[
            ['Número de ventas',   ventas.length],
            ['Total ventas',       fmt(totalVentas)],
            ['💵 Efectivo',        fmt(totalEfectivo)],
            ['💳 Tarjeta',         fmt(totalTarjeta)],
            ['↗ Transferencia',    fmt(totalTransferencia)],
            ['⌂ Cargado a cuentas', fmt(totalCuentas)],
            ['✓ Cobros de cuentas', fmt(accountPayments.reduce((sum, payment) => sum + payment.amount, 0))],
            ['+ Ingresos caja chica', fmt(cashIncomes)],
            ['− Egresos caja chica', fmt(cashExpenses)],
          ].map(([l,v]) => (
            <div key={l} style={{
              display:'flex', justifyContent:'space-between', fontSize:13,
              padding:'6px 0', borderBottom:`1px solid var(--border)`,
            }}>
              <span style={{ color:'var(--text2)' }}>{l}</span>
              <span style={{ fontWeight:500 }}>{v}</span>
            </div>
          ))}
          <div style={{
            display:'flex', justifyContent:'space-between',
            padding:'10px 14px', background:'var(--green-light)',
            borderRadius:10, marginTop:10,
            fontWeight:600, fontSize:16, color:'var(--green-dark)',
          }}>
            <span>💵 Total en caja</span>
            <span>{fmt(totalCaja)}</span>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:6 }}>
            Fondo {fmt(fondoNum)} + efectivo {fmt(totalEfectivo)} + ingresos {fmt(cashIncomes)} − egresos {fmt(cashExpenses)}
          </div>
        </Card>

        {/* Top productos */}
        {top.length > 0 && (
          <Card icon="📈" title="Top productos del día">
            {top.map(it => (
              <div key={it.name} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, fontSize:13 }}>
                <span style={{ flex:1 }}>{it.name}</span>
                <div style={{ width:80, height:6, background:'var(--bg2)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:Math.round(it.rev/maxRev*100)+'%', height:'100%', background:'var(--amber-mid)', borderRadius:3 }} />
                </div>
                <span style={{ fontSize:11, color:'var(--text3)', minWidth:36, textAlign:'right' }}>{it.qty} uds</span>
                <span style={{ fontWeight:500, color:'var(--amber)', minWidth:50, textAlign:'right' }}>{fmt(it.rev)}</span>
              </div>
            ))}
          </Card>
        )}

        {ventas.length === 0 && (
          <div style={{
            padding:'14px 16px', borderRadius:10, background:'var(--bg2)',
            fontSize:13, color:'var(--text3)', textAlign:'center',
          }}>
            ℹ️ No hay ventas registradas hoy. Registra ventas antes de cerrar la caja.
          </div>
        )}

        {/* Historial de cierres */}
        {cierres.length > 0 && (
          <>
            <div style={{
              fontSize:12, fontWeight:600, color:'var(--text3)',
              textTransform:'uppercase', letterSpacing:'0.04em',
              margin:'20px 0 10px',
            }}>Historial de cierres</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {cierres.map(c => (
                <div className="closing-history-row" key={c.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'12px 14px', background:'#fff',
                  border:`1px solid var(--border)`, borderRadius:10,
                }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                      <span style={{ fontWeight:600, fontSize:13 }}>{c.fecha}</span>
                      <span style={{
                        fontSize:11, padding:'1px 8px', borderRadius:6,
                        background:'var(--green-light)', color:'var(--green)',
                      }}>🔒 Cerrado</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>
                      {c.hora} · {c.num_ventas} venta(s) · Fondo {fmt(c.fondo_inicial)}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ fontWeight:600, fontSize:15, color:'var(--green)' }}>{fmt(c.total_caja)}</div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        onClick={() => setDetalle(c)}
                        style={{
                          padding:'5px 10px', borderRadius:7, border:`1px solid var(--border)`,
                          background:'transparent', fontSize:12, cursor:'pointer', color:'var(--text2)',
                        }}>Ver detalle</button>
                      <a href={`/api/export/cierre/${c.id}`} style={{
                        padding:'5px 10px', borderRadius:7, border:`1px solid var(--border)`,
                        fontSize:12, color:'var(--text2)', textDecoration:'none',
                      }}>⬇ Excel</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Card({ icon, title, children }) {
  return (
    <div style={{
      background:'#fff', border:`1px solid var(--border)`,
      borderRadius:12, marginBottom:14, overflow:'hidden',
    }}>
      <div style={{
        padding:'10px 16px', borderBottom:`1px solid var(--border)`,
        background:'var(--bg2)', display:'flex', alignItems:'center', gap:8,
      }}>
        <span>{icon}</span>
        <span style={{ fontSize:13, fontWeight:600 }}>{title}</span>
      </div>
      <div style={{ padding:'14px 16px' }}>{children}</div>
    </div>
  );
}
