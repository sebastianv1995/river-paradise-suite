import { useState, useEffect } from 'react';

const fmt = n => '$' + Number(n).toFixed(2);

export default function Ventas({ location }) {
  const [ventas,  setVentas]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [fecha,   setFecha]   = useState('');

  useEffect(() => {
    const today = new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' });
    setFecha(today);
    load(today);
  }, [location]);

  async function load(f) {
    setLoading(true);
    const data = await fetch(`/api/ventas?fecha=${encodeURIComponent(f)}&location=${location}`).then(r => r.json());
    setVentas(data);
    setLoading(false);
  }

  const total    = ventas.reduce((s, v) => s + v.total, 0);

  return (
    <div className="sales-page" style={{ padding:16, overflowY:'auto', flex:1 }}>

      {/* Stats */}
      <div className="sales-stats" style={{ display:'flex', gap:10, marginBottom:16 }}>
        {[
          ['Ventas', ventas.length],
          ['Total del día', fmt(total)],
        ].map(([l, v]) => (
          <div key={l} style={{
            flex:1, background:'var(--bg2)', borderRadius:10,
            padding:'10px 14px', textAlign:'center',
          }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:600 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Export button */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
          Ventas del {fecha}
        </div>
        <a href={`/api/export/ventas?fecha=${encodeURIComponent(fecha)}&location=${location}`}
           style={{
             padding:'6px 14px', borderRadius:8, border:`1px solid var(--border)`,
             fontSize:12, color:'var(--text2)', textDecoration:'none',
             background:'#fff', fontWeight:500,
           }}>
          ⬇ Exportar Excel
        </a>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>Cargando...</div>
      ) : ventas.length === 0 ? (
        <div style={{
          textAlign:'center', padding:40, color:'var(--text3)',
          fontSize:13, background:'var(--bg2)', borderRadius:12,
        }}>
          No hay ventas registradas para esta fecha.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {ventas.map((v, i) => (
            <div className="sale-row" key={v.id} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 14px', background:'#fff',
              border:`1px solid var(--border)`, borderRadius:10,
            }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>Mesa {v.mesa_numero || v.mesa_id}</span>
                  <span style={{
                    fontSize:11, padding:'1px 8px', borderRadius:6,
                    background:'var(--teal-light)', color:'var(--teal)',
                  }}>Cobrada</span>
                  <span style={{ fontSize:11, padding:'1px 8px', borderRadius:6, background:'var(--bg2)', color:'var(--text2)', textTransform:'capitalize' }}>
                    {v.payment_method || 'Efectivo'}
                  </span>
                  {v.payment_reference && <span style={{ fontSize:11, color:'var(--text3)' }}>Comp. {v.payment_reference}</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>
                  {v.hora} · {v.items?.length || 0} ítem(s)
                </div>
                {v.items && (
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>
                    {v.items.map(it => it.name + (it.qty > 1 ? ' x'+it.qty : '')).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ fontWeight:600, fontSize:15, color:'var(--green)', whiteSpace:'nowrap', marginLeft:12 }}>
                {fmt(v.total)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
