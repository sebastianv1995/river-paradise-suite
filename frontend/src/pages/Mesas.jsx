import { useState, useEffect, useCallback } from 'react';

const fmt = n => '$' + Number(n).toFixed(2);
const api = async (url, opts) => {
  const response = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo completar la operación');
  }
  return response;
};

// ── Stat card ──────────────────────────────────────────────────
function StatCard({ label, value }) {
  return (
    <div style={{
      background:'var(--bg2)', borderRadius:10, padding:'10px 14px', textAlign:'center', flex:1,
    }}>
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:600 }}>{value}</div>
    </div>
  );
}

// ── Table card ─────────────────────────────────────────────────
function TableCard({ mesa, selected, onClick }) {
  const colors = {
    libre:   { bg:'#fff',                border:'var(--border)',  dot:'#ccc',              text:'var(--text3)' },
    ocupada: { bg:'var(--amber-light)',   border:'var(--amber)',   dot:'var(--amber-mid)',  text:'var(--amber)' },
    pagando: { bg:'var(--green-light)',   border:'var(--green)',   dot:'var(--green-mid)',  text:'var(--green)' },
  };
  const c = colors[mesa.status];
  return (
    <div onClick={onClick} style={{
      borderRadius:12, border: selected ? `2px solid var(--amber)` : `1px solid ${c.border}`,
      padding:'12px', cursor:'pointer', background:c.bg, position:'relative',
      transition:'transform 0.1s, box-shadow 0.1s',
      boxShadow: selected ? '0 0 0 3px rgba(186,117,23,0.15)' : 'none',
    }}
    onMouseEnter={e => e.currentTarget.style.transform='translateY(-2px)'}
    onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
    >
      <div style={{
        position:'absolute', top:10, right:10, width:8, height:8,
        borderRadius:'50%', background:c.dot,
      }} />
      <div style={{ fontSize:20, fontWeight:600, marginBottom:2 }}>
        🪑 {mesa.number || mesa.id}
      </div>
      <div style={{ fontSize:11, color:c.text }}>
        {mesa.status === 'libre' ? 'Libre' : mesa.status === 'ocupada' ? 'Ocupada' : 'Pagando'}
      </div>
      {mesa.total > 0 && (
        <div style={{ fontSize:13, fontWeight:500, marginTop:6 }}>{fmt(mesa.total)}</div>
      )}
    </div>
  );
}

// ── Menu panel ─────────────────────────────────────────────────
function MenuPanel({ mesaNumber, menu, onAdd, onBack }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{
        padding:'14px 16px', borderBottom:`1px solid var(--border)`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <div style={{ fontWeight:600, fontSize:15 }}>Agregar ítems</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>Mesa {mesaNumber}</div>
        </div>
        <button onClick={onBack} style={{
          width:28, height:28, borderRadius:8, border:`1px solid var(--border)`,
          background:'transparent', fontSize:16, color:'var(--text2)',
        }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {Object.entries(menu).map(([sec, items]) => (
          <div key={sec}>
            <div style={{
              fontSize:11, fontWeight:600, color:'var(--text3)',
              textTransform:'uppercase', letterSpacing:'0.06em',
              margin:'14px 0 8px', paddingBottom:4,
              borderBottom:`1px solid var(--border)`,
            }}>{sec}</div>
            {items.map(item => (
              <div key={item.id} onClick={() => onAdd(item)} style={{
                display:'flex', alignItems:'center', padding:'8px 10px',
                borderRadius:8, cursor:'pointer', gap:10,
                border:`1px solid transparent`,
                transition:'all 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--amber-light)'; e.currentTarget.style.borderColor='var(--amber)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='transparent'; }}
              >
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13 }}>{item.name}</div>
                  {item.desc && <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{item.desc}</div>}
                </div>
                <div style={{ fontSize:13, fontWeight:500, color:'var(--amber)' }}>{fmt(item.price)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Order panel ────────────────────────────────────────────────
function OrderPanel({ mesa, menu, onClose, onRefresh }) {
  const [showMenu, setShowMenu] = useState(mesa.status === 'ocupada' && mesa.items.length === 0);
  const [loading, setLoading]   = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [accountType, setAccountType] = useState('habitacion');
  const [accountName, setAccountName] = useState('');
  const [room, setRoom] = useState('');
  const [accountNote, setAccountNote] = useState('');

  const total = mesa.items.reduce((s, i) => s + i.price * i.qty, 0);

  async function doOpen() {
    setLoading(true);
    await api(`/api/mesas/${mesa.id}/open`, { method:'POST' });
    setShowMenu(true);
    onRefresh();
    setLoading(false);
  }

  async function addItem(item) {
    await api(`/api/mesas/${mesa.id}/items`, {
      method:'POST',
      body: JSON.stringify({ item_id:item.id }),
    });
    onRefresh();
  }

  async function changeQty(rowId, delta) {
    await api(`/api/mesas/${mesa.id}/items/${rowId}`, {
      method:'PUT', body:JSON.stringify({ delta }),
    });
    onRefresh();
  }

  async function removeItem(rowId) {
    await api(`/api/mesas/${mesa.id}/items/${rowId}`, { method:'DELETE' });
    onRefresh();
  }

  async function doCobrar() {
    setLoading(true);
    try {
      await api(`/api/mesas/${mesa.id}/cobrar`, { method:'POST' });
      await onRefresh();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelPayment() {
    setLoading(true);
    try {
      await api(`/api/mesas/${mesa.id}/cancelar-cobro`, { method:'POST' });
      setPaymentMethod('');
      setPaymentReference('');
      await onRefresh();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function doCerrar(cobrado) {
    setLoading(true);
    try {
      await api(`/api/mesas/${mesa.id}/cerrar`, {
        method:'POST', body:JSON.stringify({
          cobrado, payment_method:paymentMethod, payment_reference:paymentReference,
          account_type:accountType, account_name:accountName, room, account_note:accountNote,
        }),
      });
      onClose();
      await onRefresh();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  function cancelOrder() {
    const confirmed = window.confirm(
      `¿Cancelar el pedido de la Mesa ${mesa.number || mesa.id}?\n\n` +
      'La mesa quedará libre y el pedido se eliminará. No se registrará ninguna venta.'
    );
    if (confirmed) doCerrar(false);
  }

  if (showMenu) return (
    <MenuPanel mesaNumber={mesa.number || mesa.id} menu={menu} onAdd={addItem} onBack={() => setShowMenu(false)} />
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{
        padding:'14px 16px', borderBottom:`1px solid var(--border)`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <div style={{ fontWeight:600, fontSize:15 }}>Mesa {mesa.number || mesa.id}</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>
            {mesa.status === 'libre' ? 'Libre' : mesa.status === 'ocupada' ? `Ocupada · ${mesa.items.length} ítem(s)` : 'Pagando'}
          </div>
        </div>
        <button onClick={onClose} style={{
          width:28, height:28, borderRadius:8, border:`1px solid var(--border)`,
          background:'transparent', fontSize:16, color:'var(--text2)',
        }}>✕</button>
      </div>

      {/* Items */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {mesa.items.length === 0 ? (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', padding:'40px 0', gap:8,
            color:'var(--text3)', fontSize:13, textAlign:'center',
          }}>
            <div style={{ fontSize:28, opacity:0.4 }}>📋</div>
            <div>Sin ítems aún.<br/>Agrega del menú.</div>
          </div>
        ) : mesa.items.map(item => (
          <div key={item.id} style={{
            display:'flex', alignItems:'center', gap:8, padding:'8px 0',
            borderBottom:`1px solid var(--border)`,
          }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13 }}>{item.name}</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{fmt(item.price)} c/u</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <button onClick={() => changeQty(item.id, -1)} style={qtyBtnStyle}>−</button>
              <span style={{ fontSize:13, fontWeight:500, minWidth:18, textAlign:'center' }}>{item.qty}</span>
              <button onClick={() => changeQty(item.id,  1)} style={qtyBtnStyle}>+</button>
            </div>
            <div style={{ fontSize:13, fontWeight:500, minWidth:48, textAlign:'right' }}>{fmt(item.price * item.qty)}</div>
            <button onClick={() => removeItem(item.id)} style={{
              width:22, height:22, borderRadius:6, border:'none',
              background:'transparent', color:'var(--text3)', cursor:'pointer', fontSize:14,
            }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--coral-light)'; e.currentTarget.style.color='var(--coral)'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text3)'; }}
            >🗑</button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding:'14px 16px', borderTop:`1px solid var(--border)` }}>
        {mesa.status !== 'libre' && (
          <>
            <div style={{
              display:'flex', justifyContent:'space-between',
              fontSize:16, fontWeight:600, padding:'8px 0',
              borderTop:`1px solid var(--border)`, marginTop:4, marginBottom:12,
            }}>
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </>
        )}

        {mesa.status === 'libre' && (
          <Btn onClick={doOpen} disabled={loading} color="amber">Abrir mesa</Btn>
        )}
        {mesa.status === 'ocupada' && (<>
          <Btn onClick={() => setShowMenu(true)} color="amber-outline" style={{ marginBottom:8 }}>
            + Agregar del menú
          </Btn>
          <Btn onClick={doCobrar} disabled={total === 0 || loading} color="amber">
            Cobrar {fmt(total)}
          </Btn>
          <Btn onClick={cancelOrder} disabled={loading} color="ghost" style={{ marginTop:6 }}>
            Cancelar pedido
          </Btn>
        </>)}
        {mesa.status === 'pagando' && (
          <>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:7 }}>¿Cómo pagó el cliente?</div>
            <div className="payment-methods">
              {[
                ['efectivo','💵','Efectivo'],
                ['tarjeta','💳','Tarjeta'],
                ['transferencia','↗','Transferencia'],
                ['cuenta','⌂','Cargar a cuenta'],
              ].map(([value, icon, label]) => (
                <button key={value} onClick={() => setPaymentMethod(value)} className={`payment-option ${paymentMethod === value ? 'selected' : ''}`}>
                  <span>{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
            {paymentMethod && paymentMethod !== 'efectivo' && (
              paymentMethod !== 'cuenta' &&
              <label className="payment-reference">
                <span>Número de comprobante <small>(opcional)</small></span>
                <input value={paymentReference} maxLength={80} placeholder="Ej. 00458219"
                  onChange={event => setPaymentReference(event.target.value)} />
              </label>
            )}
            {paymentMethod === 'cuenta' && <div className="account-charge-form">
              <label><span>Tipo de cuenta</span><select value={accountType} onChange={e => setAccountType(e.target.value)}>
                <option value="habitacion">Huésped / habitación</option><option value="propietario">Propietario</option><option value="otro">Otro autorizado</option>
              </select></label>
              {accountType === 'habitacion' && <label><span>Habitación</span><input value={room} maxLength={20} onChange={e => setRoom(e.target.value)} placeholder="Ej. 5" /></label>}
              <label><span>Nombre del responsable</span><input value={accountName} maxLength={100} onChange={e => setAccountName(e.target.value)} placeholder="Nombre completo" /></label>
              <label><span>Nota (opcional)</span><input value={accountNote} maxLength={150} onChange={e => setAccountNote(e.target.value)} placeholder="Detalle del cargo" /></label>
            </div>}
            <Btn onClick={() => doCerrar(true)} disabled={loading || !paymentMethod || (paymentMethod === 'cuenta' && (!accountName.trim() || (accountType === 'habitacion' && !room.trim())))} color="green">
              ✓ {paymentMethod === 'cuenta' ? 'Cargar consumo y liberar mesa' : `Confirmar ${paymentMethod ? `pago con ${paymentMethod}` : 'pago'}`}
            </Btn>
            <Btn onClick={cancelPayment} disabled={loading} color="ghost" style={{ marginTop:7 }}>
              ← Cancelar cobro y continuar pedido
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text2)', marginBottom:4 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

const qtyBtnStyle = {
  width:22, height:22, borderRadius:6, border:`1px solid var(--border)`,
  background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text2)',
  display:'flex', alignItems:'center', justifyContent:'center',
};

function Btn({ children, onClick, disabled, color, style={} }) {
  const styles = {
    amber:         { background:'var(--amber)',        color:'#fff',            border:'none' },
    'amber-outline':{ background:'var(--amber-light)', color:'var(--amber)',    border:`1px solid var(--amber)` },
    green:         { background:'var(--green)',         color:'#fff',            border:'none' },
    ghost:         { background:'transparent',          color:'var(--text2)',   border:`1px solid var(--border)` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:'100%', padding:'9px 0', borderRadius:8, fontSize:13, fontWeight:500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...styles[color], ...style,
    }}>
      {children}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function Mesas({ location }) {
  const [mesas, setMesas]       = useState([]);
  const [menu, setMenu]         = useState({});
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const data = await api(`/api/mesas?location=${location}`).then(r => r.json());
    setMesas(data);
    if (selected) {
      const updated = data.find(m => m.id === selected);
      if (updated) setSelected(updated.id);
    }
  }, [selected, location]);

  useEffect(() => { setSelected(null); load(); }, [location]);

  useEffect(() => {
    api('/api/menu').then(r => r.json()).then(setMenu).catch(console.error);
  }, []);

  const libres   = mesas.filter(m => m.status === 'libre').length;
  const ocupadas = mesas.filter(m => m.status !== 'libre').length;
  const ventasDia = mesas.reduce((s, m) => s + m.total, 0);
  const selectedMesa = mesas.find(m => m.id === selected);

  return (
    <div className="mesas-layout" style={{ display:'flex', flex:1, overflow:'hidden' }}>
      {/* Left panel */}
      <div className="mesas-content" style={{ flex:1, padding:16, overflowY:'auto' }}>
        {/* Stats */}
        <div className="stats-row" style={{ display:'flex', gap:10, marginBottom:14 }}>
          <StatCard label="Libres"          value={libres} />
          <StatCard label="Ocupadas"        value={ocupadas} />
          <StatCard label="En mesas (hoy)"  value={fmt(ventasDia)} />
        </div>

        {/* Legend */}
        <div style={{ display:'flex', gap:14, marginBottom:12 }}>
          {[['#ccc','Libre'],['var(--amber-mid)','Ocupada'],['var(--green-mid)','Pagando']].map(([c,l]) => (
            <span key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text2)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block' }}/>
              {l}
            </span>
          ))}
        </div>

        <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>
          Mesas del restaurante
        </div>

        <div className="mesas-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {mesas.map(m => (
            <TableCard
              key={m.id}
              mesa={m}
              selected={selected === m.id}
              onClick={() => setSelected(m.id === selected ? null : m.id)}
            />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className={`order-sidebar ${selectedMesa ? 'open' : ''}`} style={{ width:310, borderLeft:`1px solid var(--border)`, display:'flex', flexDirection:'column', background:'#fff' }}>
        {selectedMesa ? (
          <OrderPanel
            key={selectedMesa.id + '-' + selectedMesa.status}
            mesa={selectedMesa}
            menu={menu}
            onClose={() => setSelected(null)}
            onRefresh={load}
          />
        ) : (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', height:'100%', gap:10,
            color:'var(--text3)', padding:32, textAlign:'center',
          }}>
            <div style={{ fontSize:36, opacity:0.3 }}>🪑</div>
            <div style={{ fontSize:13 }}>Selecciona una mesa<br/>para gestionar su pedido</div>
          </div>
        )}
      </div>
    </div>
  );
}
