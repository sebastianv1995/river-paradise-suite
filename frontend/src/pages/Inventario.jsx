import { useEffect, useState } from 'react';

const fmtDate = value => new Date(value).toLocaleString('es-EC', { dateStyle:'short', timeStyle:'short' });

export default function Inventario() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [adjustments, setAdjustments] = useState({});
  const [adjustmentNotes, setAdjustmentNotes] = useState({});
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [inventoryResponse, movementsResponse] = await Promise.all([
      fetch('/api/inventory'), fetch('/api/inventory/movements'),
    ]);
    if (!inventoryResponse.ok || !movementsResponse.ok) throw new Error('No se pudo cargar el inventario');
    setProducts(await inventoryResponse.json());
    setMovements(await movementsResponse.json());
  }

  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, []);

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const totalSold = products.reduce((sum, product) => sum + product.sold, 0);
  const lowStock = products.filter(product => product.stock <= product.stock_min).length;

  async function addEntry(product) {
    setSaving(product.id);
    setMessage('');
    try {
      const response = await fetch(`/api/inventory/${product.id}/entries`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ quantity:Number(quantities[product.id]) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar la entrada');
      setQuantities(current => ({ ...current, [product.id]:'' }));
      setMessage(`✓ Entrada registrada. Ahora quedan ${result.stock} unidades de ${product.name}.`);
      await load();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function adjustStock(product) {
    setSaving(`adjust-${product.id}`);
    setMessage('');
    try {
      const response = await fetch(`/api/inventory/${product.id}/adjustments`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ quantity:Number(adjustments[product.id]), note:adjustmentNotes[product.id] || '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo ajustar el inventario');
      setAdjustments(current => ({ ...current, [product.id]:'' }));
      setAdjustmentNotes(current => ({ ...current, [product.id]:'' }));
      setMessage(`✓ Stock corregido. Ahora quedan ${result.stock} unidades de ${product.name}.`);
      await load();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(null);
    }
  }

  function renderProduct(product) {
    const low = product.stock <= product.stock_min;
    const byBoxes = product.package_size > 1;
    return <div className="inventory-card" key={product.id} style={{ background:'#fff', border:`1px solid ${low ? 'var(--coral)' : 'var(--border)'}`, borderRadius:12, padding:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>{product.name}</div>
          <div style={{ fontSize:11, color:low ? 'var(--coral)' : 'var(--text3)' }}>
            {low ? `Stock bajo · mínimo ${product.stock_min}` : `Mínimo ${product.stock_min}`}
          </div>
          {byBoxes && <div style={{ fontSize:11, color:'var(--amber)', marginTop:2 }}>1 caja = {product.package_size} cigarrillos</div>}
        </div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:26, lineHeight:1, fontWeight:600, color:low ? 'var(--coral)' : 'var(--green)' }}>{product.stock}</div><div style={{ fontSize:10, color:'var(--text3)' }}>unidades disponibles</div></div>
      </div>
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        <Metric label="Ingresaron" value={product.received}/><Metric label="Vendidos" value={product.sold}/><Metric label="Quedan" value={product.stock}/>
      </div>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text2)', marginBottom:5 }}>{byBoxes ? 'Registrar entrada por cajas' : 'Registrar nueva entrada'}</div>
      <div className="stock-entry-form" style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:6 }}>
        <input aria-label={`Cantidad recibida de ${product.name}`} type="number" min="1" step="1" placeholder={byBoxes ? 'Nº de cajas' : 'Cantidad'} value={quantities[product.id] || ''}
          onChange={e => setQuantities(current => ({ ...current, [product.id]:e.target.value }))} style={inputStyle}/>
        <button disabled={!Number(quantities[product.id]) || saving === product.id} onClick={() => addEntry(product)} style={buttonStyle}>{saving === product.id ? '…' : 'Ingresar'}</button>
      </div>
      {byBoxes && Number(quantities[product.id]) > 0 && <div style={{ fontSize:11, color:'var(--green)', marginTop:5 }}>
        Se agregarán {Number(quantities[product.id]) * product.package_size} cigarrillos al inventario.
      </div>}
      <div style={{ fontSize:11, fontWeight:600, color:'var(--text2)', margin:'12px 0 5px' }}>Corregir stock por unidades</div>
      <div className="stock-entry-form" style={{ display:'grid', gridTemplateColumns:'85px 1fr 78px', gap:6 }}>
        <input aria-label={`Ajuste de ${product.name}`} type="number" step="1" placeholder="+ / −" value={adjustments[product.id] || ''}
          onChange={e => setAdjustments(current => ({ ...current, [product.id]:e.target.value }))} style={inputStyle}/>
        <input aria-label={`Motivo del ajuste de ${product.name}`} required maxLength={200} placeholder="Motivo obligatorio" value={adjustmentNotes[product.id] || ''}
          onChange={e => setAdjustmentNotes(current => ({ ...current, [product.id]:e.target.value }))} style={inputStyle}/>
        <button disabled={!Number.isInteger(Number(adjustments[product.id])) || Number(adjustments[product.id]) === 0 || !adjustmentNotes[product.id]?.trim() || saving === `adjust-${product.id}`}
          onClick={() => adjustStock(product)} style={{ ...buttonStyle, background:'var(--teal)' }}>{saving === `adjust-${product.id}` ? '…' : 'Ajustar'}</button>
      </div>
    </div>;
  }

  return (
    <div className="page-container inventory-page" style={{ padding:16, overflowY:'auto', flex:1 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:18, fontWeight:600 }}>Control de inventario</div>
        <div style={{ fontSize:12, color:'var(--text2)' }}>Registra lo que llega; las ventas se descuentan al confirmar el pago.</div>
      </div>

      {message && <div style={{
        padding:'9px 12px', borderRadius:8, marginBottom:12, fontSize:13,
        background:message.startsWith('Error') ? 'var(--coral-light)' : 'var(--green-light)',
        color:message.startsWith('Error') ? 'var(--coral)' : 'var(--green-dark)',
      }}>{message}</div>}

      <div className="summary-grid">
        <SummaryCard label="Unidades disponibles" value={totalStock} tone="green" />
        <SummaryCard label="Unidades vendidas" value={totalSold} tone="amber" />
        <SummaryCard label="Productos con stock bajo" value={lowStock} tone={lowStock ? 'coral' : 'green'} />
      </div>

      <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', margin:'18px 0 8px' }}>Bebidas y otros productos</div>
      <div className="inventory-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(285px,1fr))', gap:10 }}>
        {products.filter(product => product.inventory_section !== 'tabacos').map(renderProduct)}
      </div>

      <div style={{ fontSize:14, fontWeight:700, color:'var(--amber)', textTransform:'uppercase', margin:'24px 0 4px' }}>Tabacos</div>
      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:9 }}>Las entradas se registran por cajas; las ventas y existencias se controlan por cigarrillos individuales.</div>
      <div className="inventory-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(285px,1fr))', gap:10 }}>
        {products.filter(product => product.inventory_section === 'tabacos').map(renderProduct)}
      </div>

      <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', margin:'22px 0 8px' }}>Últimos movimientos</div>
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {movements.length === 0 ? <div style={{ padding:20, textAlign:'center', color:'var(--text3)', fontSize:13 }}>Todavía no hay movimientos.</div> : movements.slice(0, 100).map(movement => (
          <div className="movement-row" key={movement.id} style={{ display:'grid', gridTemplateColumns:'1fr 110px 90px 150px', gap:10, padding:'9px 12px', borderBottom:'1px solid var(--border)', fontSize:12 }}>
            <span>{movement.product_name}{movement.note && <small style={{ display:'block', color:'var(--text3)', marginTop:2 }}>{movement.note}</small>}</span>
            <span style={{ color:movement.quantity > 0 ? 'var(--green)' : 'var(--coral)', fontWeight:600 }}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</span>
            <span>{movement.type === 'entrada' ? 'Entrada' : movement.type === 'venta' ? 'Venta' : 'Ajuste'}</span>
            <span style={{ color:'var(--text3)' }}>{fmtDate(movement.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={{ flex:1, background:'var(--bg2)', borderRadius:8, padding:'6px 8px', textAlign:'center' }}>
    <div style={{ fontSize:10, color:'var(--text3)' }}>{label}</div><div style={{ fontWeight:600 }}>{value}</div>
  </div>;
}

function SummaryCard({ label, value, tone }) {
  const colors = { green:'var(--green)', amber:'var(--amber)', coral:'var(--coral)' };
  return <div className="summary-card">
    <div style={{ fontSize:11, color:'var(--text3)' }}>{label}</div>
    <div style={{ fontSize:24, fontWeight:600, color:colors[tone] }}>{value}</div>
  </div>;
}

const inputStyle = { width:'100%', minWidth:0, border:'1px solid var(--border)', borderRadius:7, padding:'6px 8px', fontSize:12 };
const buttonStyle = { border:'none', borderRadius:7, background:'var(--amber)', color:'#fff', fontSize:11, fontWeight:500 };
