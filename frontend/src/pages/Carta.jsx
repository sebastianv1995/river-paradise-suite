import { useEffect, useState } from 'react';

const fieldStyle = {
  border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px',
  fontSize:13, background:'#fff', color:'var(--text)', width:'100%',
};

export default function Carta() {
  const [menu, setMenu] = useState({});
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [newProduct, setNewProduct] = useState({ category:'', name:'', desc:'', price:'', track_stock:false, stock_min:0 });

  useEffect(() => {
    fetch('/api/menu').then(async response => {
      if (!response.ok) throw new Error('No se pudo cargar la carta');
      return response.json();
    }).then(data => {
      setMenu(data);
      setDrafts(Object.fromEntries(Object.values(data).flat().map(item => [item.id, { ...item }])));
    }).catch(error => setMessage(error.message));
  }, []);

  function change(id, field, value) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setMessage('');
  }

  async function save(id) {
    setSaving(id);
    setMessage('');
    try {
      const response = await fetch(`/api/menu/${encodeURIComponent(id)}`, {
        method:'PUT', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(drafts[id]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar');
      setMenu(current => Object.fromEntries(Object.entries(current).map(([category, items]) => [
        category, items.map(item => item.id === id ? result : item),
      ])));
      setDrafts(current => ({ ...current, [id]: { ...result } }));
      setMessage(`✓ ${result.name} actualizado`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch('/api/menu', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(newProduct),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo crear el producto');
      setMenu(result.menu);
      setDrafts(Object.fromEntries(Object.values(result.menu).flat().map(item => [item.id, { ...item }])));
      setNewProduct({ category:'', name:'', desc:'', price:'', track_stock:false, stock_min:0 });
      setMessage(`✓ ${result.product.name} agregado a la carta${result.product.track_stock ? ' y al inventario' : ''}`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-container" style={{ padding:16, overflowY:'auto', flex:1, maxWidth:900 }}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:600 }}>Actualizar carta</div>
        <div style={{ fontSize:12, color:'var(--text2)' }}>Edita cada producto y guarda sus cambios individualmente.</div>
      </div>

      {message && <div style={{
        padding:'9px 12px', borderRadius:8, marginBottom:12, fontSize:13,
        background:message.startsWith('Error') ? 'var(--coral-light)' : 'var(--green-light)',
        color:message.startsWith('Error') ? 'var(--coral)' : 'var(--green-dark)',
      }}>{message}</div>}

      <form onSubmit={createProduct} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>Agregar nuevo producto</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 100px', gap:8, marginBottom:8 }}>
          <label className="field-group"><span>Categoría</span><input list="menu-categories" required maxLength={80} value={newProduct.category} placeholder="Ej. Bebidas"
            onChange={e => setNewProduct(current => ({ ...current, category:e.target.value }))} style={fieldStyle}/></label>
          <datalist id="menu-categories">{Object.keys(menu).map(category => <option key={category} value={category}/>)}</datalist>
          <label className="field-group"><span>Nombre del producto</span><input required maxLength={100} value={newProduct.name} placeholder="Ej. Coca-Cola 500 ml"
            onChange={e => setNewProduct(current => ({ ...current, name:e.target.value }))} style={fieldStyle}/></label>
          <label className="field-group"><span>Precio de venta ($)</span><input required type="number" min="0" max="9999.99" step="0.01" value={newProduct.price} placeholder="Ej. 1.50"
            onChange={e => setNewProduct(current => ({ ...current, price:e.target.value }))} style={fieldStyle}/></label>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 110px 100px', gap:8, alignItems:'end' }}>
          <label className="field-group"><span>Descripción (opcional)</span><input maxLength={300} value={newProduct.desc} placeholder="Ej. Botella personal de 500 ml"
            onChange={e => setNewProduct(current => ({ ...current, desc:e.target.value }))} style={fieldStyle}/></label>
          <label title="Márcalo para bebidas y productos que se cuentan por unidades" style={{ display:'flex', alignItems:'center', gap:6, paddingBottom:8, fontSize:12 }}><input type="checkbox" checked={newProduct.track_stock}
            onChange={e => setNewProduct(current => ({ ...current, track_stock:e.target.checked }))}/> Controlar existencias</label>
          <label className="field-group" title="Cantidad en la que el sistema avisará que quedan pocas unidades"><span>Avisar cuando queden</span><input type="number" min="0" step="1" disabled={!newProduct.track_stock} value={newProduct.stock_min}
            onChange={e => setNewProduct(current => ({ ...current, stock_min:e.target.value }))} style={fieldStyle}/></label>
          <button disabled={creating} style={{ height:34, border:'none', borderRadius:8, background:'var(--green)', color:'#fff', fontWeight:600 }}>
            {creating ? 'Agregando…' : '+ Agregar'}
          </button>
        </div>
      </form>

      {Object.entries(menu).map(([category, items]) => (
        <section key={category} style={{ marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--amber)', marginBottom:8 }}>{category}</div>
          <div className="product-edit-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {items.map(item => {
              const draft = drafts[item.id] || item;
              const changed = draft.name !== item.name || draft.desc !== item.desc || Number(draft.price) !== item.price ||
                Boolean(draft.track_stock) !== Boolean(item.track_stock) || Number(draft.stock_min || 0) !== Number(item.stock_min || 0);
              return (
                <div className="product-edit-row" key={item.id} style={{
                  display:'grid', gridTemplateColumns:'1.1fr 1.7fr 95px 105px 90px', gap:8,
                  padding:10, background:'#fff', border:'1px solid var(--border)', borderRadius:10,
                }}>
                  <label className="field-group"><span>Producto</span><input value={draft.name} maxLength={100}
                    onChange={e => change(item.id, 'name', e.target.value)} style={fieldStyle}/></label>
                  <label className="field-group"><span>Descripción</span><input value={draft.desc} maxLength={300}
                    placeholder="Sin descripción" onChange={e => change(item.id, 'desc', e.target.value)} style={fieldStyle}/></label>
                  <label className="field-group"><span>Precio</span><input type="number" min="0" max="9999.99" step="0.01"
                    value={draft.price} onChange={e => change(item.id, 'price', e.target.value)} style={fieldStyle}/></label>
                  <div className="field-group"><span>Inventario</span><label style={{ display:'flex', gap:5, alignItems:'center', fontSize:11, minHeight:34 }}>
                    <input type="checkbox" checked={draft.track_stock === true} onChange={e => change(item.id, 'track_stock', e.target.checked)}/> Stock
                    {draft.track_stock && <input aria-label="Stock mínimo" type="number" min="0" step="1" value={draft.stock_min ?? 0}
                      onChange={e => change(item.id, 'stock_min', e.target.value)} style={{ ...fieldStyle, width:48, padding:'5px' }}/>} </label></div>
                  <button onClick={() => save(item.id)} disabled={!changed || saving === item.id} style={{
                    border:'none', borderRadius:8, fontSize:12, fontWeight:500,
                    background:changed ? 'var(--amber)' : 'var(--bg2)',
                    color:changed ? '#fff' : 'var(--text3)',
                    cursor:changed ? 'pointer' : 'not-allowed',
                  }}>{saving === item.id ? 'Guardando…' : 'Guardar'}</button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
