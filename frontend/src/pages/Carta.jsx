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

      {Object.entries(menu).map(([category, items]) => (
        <section key={category} style={{ marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--amber)', marginBottom:8 }}>{category}</div>
          <div className="product-edit-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {items.map(item => {
              const draft = drafts[item.id] || item;
              const changed = draft.name !== item.name || draft.desc !== item.desc || Number(draft.price) !== item.price;
              return (
                <div className="product-edit-row" key={item.id} style={{
                  display:'grid', gridTemplateColumns:'1.1fr 2fr 110px 90px', gap:8,
                  padding:10, background:'#fff', border:'1px solid var(--border)', borderRadius:10,
                }}>
                  <label className="field-group"><span>Producto</span><input value={draft.name} maxLength={100}
                    onChange={e => change(item.id, 'name', e.target.value)} style={fieldStyle}/></label>
                  <label className="field-group"><span>Descripción</span><input value={draft.desc} maxLength={300}
                    placeholder="Sin descripción" onChange={e => change(item.id, 'desc', e.target.value)} style={fieldStyle}/></label>
                  <label className="field-group"><span>Precio</span><input type="number" min="0" max="9999.99" step="0.01"
                    value={draft.price} onChange={e => change(item.id, 'price', e.target.value)} style={fieldStyle}/></label>
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
