import { useEffect, useState } from 'react';

export default function Seguridad({ user, onUserChange }) {
  const [users, setUsers] = useState([]);
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ current:false, next:false, temporary:false });
  const [newUser, setNewUser] = useState({ username:'', display_name:'', role:'cajero', password:'' });
  const [passwords, setPasswords] = useState({ current_password:'', new_password:'' });

  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación');
    return result;
  }

  async function load() {
    if (user.role !== 'admin') return;
    const [userData, backupData] = await Promise.all([request('/api/security/users'), request('/api/backups')]);
    setUsers(userData); setBackups(backupData);
  }

  useEffect(() => { load().catch(error => setMessage(`Error: ${error.message}`)); }, [user.role]);

  async function changePassword(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      await request('/api/auth/change-password', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(passwords) });
      setPasswords({ current_password:'', new_password:'' });
      onUserChange({ ...user, must_change_password:false });
      setMessage('✓ Contraseña actualizada');
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setSaving(false); }
  }

  async function createUser(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      await request('/api/security/users', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(newUser) });
      setNewUser({ username:'', display_name:'', role:'cajero', password:'' }); await load();
      setMessage('✓ Usuario creado');
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setSaving(false); }
  }

  async function toggleUser(entry) {
    try {
      await request(`/api/security/users/${entry.id}/active`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ active:!entry.active }) });
      await load();
    } catch (error) { setMessage(`Error: ${error.message}`); }
  }

  async function deleteUser(entry) {
    if (!window.confirm(`¿Eliminar permanentemente al usuario ${entry.display_name} (@${entry.username})?\n\nEsta acción cerrará sus sesiones y no se puede deshacer.`)) return;
    setSaving(true); setMessage('');
    try {
      await request(`/api/security/users/${entry.id}`, { method:'DELETE' });
      await load();
      setMessage(`✓ Usuario ${entry.display_name} eliminado`);
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setSaving(false); }
  }

  async function createBackup() {
    setSaving(true); setMessage('');
    try { await request('/api/backups', { method:'POST' }); await load(); setMessage('✓ Respaldo creado'); }
    catch (error) { setMessage(`Error: ${error.message}`); } finally { setSaving(false); }
  }

  async function restoreBackup(entry) {
    if (!window.confirm(`¿Restaurar ${entry.name}? Se creará primero una copia del estado actual.`)) return;
    setSaving(true); setMessage('');
    try { await request(`/api/backups/${encodeURIComponent(entry.name)}/restore`, { method:'POST' }); setMessage('✓ Respaldo restaurado'); }
    catch (error) { setMessage(`Error: ${error.message}`); } finally { setSaving(false); }
  }

  return <div className="page-container" style={{ padding:16, overflowY:'auto', maxWidth:1050 }}>
    {message && <div className={`account-message ${message.startsWith('Error') ? 'error' : ''}`}>{message}</div>}
    {user.must_change_password && <div className="account-message error">Debes cambiar la contraseña temporal.</div>}
    <section style={card}><h2 style={title}>Cambiar contraseña</h2>
      <form onSubmit={changePassword} style={grid}>
        <PasswordInput label="Contraseña actual" visible={visiblePasswords.current} onToggle={() => setVisiblePasswords(value => ({ ...value, current:!value.current }))} required value={passwords.current_password} onChange={e => setPasswords({ ...passwords, current_password:e.target.value })} placeholder="La contraseña usada para ingresar" />
        <PasswordInput label="Nueva contraseña" visible={visiblePasswords.next} onToggle={() => setVisiblePasswords(value => ({ ...value, next:!value.next }))} required minLength={10} value={passwords.new_password} onChange={e => setPasswords({ ...passwords, new_password:e.target.value })} placeholder="Mínimo 10 caracteres" />
        <button disabled={saving} style={updatePasswordButton}>Actualizar contraseña</button>
      </form>
    </section>
    {user.role === 'admin' && <>
      <section style={card}><h2 style={title}>Usuarios</h2>
        <form onSubmit={createUser} style={grid}>
          <input required value={newUser.display_name} onChange={e => setNewUser({ ...newUser, display_name:e.target.value })} placeholder="Nombre completo" style={input}/>
          <input required value={newUser.username} onChange={e => setNewUser({ ...newUser, username:e.target.value })} placeholder="Usuario" style={input}/>
          <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role:e.target.value })} style={input}><option value="cajero">Cajero/a</option><option value="admin">Administrador</option></select>
          <PasswordInput visible={visiblePasswords.temporary} onToggle={() => setVisiblePasswords(value => ({ ...value, temporary:!value.temporary }))} required minLength={10} value={newUser.password} onChange={e => setNewUser({ ...newUser, password:e.target.value })} placeholder="Contraseña temporal" />
          <button disabled={saving} style={button}>Crear usuario</button>
        </form>
        <div style={{ marginTop:12 }}>{users.map(entry => <div key={entry.id} style={row}><span><b>{entry.display_name}</b><small style={{ display:'block', color:'var(--text3)' }}>@{entry.username} · {entry.role}</small></span><div style={userActions}><button disabled={entry.id === user.id || saving} onClick={() => toggleUser(entry)} style={entry.active ? dangerButton : button}>{entry.active ? 'Desactivar' : 'Activar'}</button><button disabled={entry.id === user.id || saving} onClick={() => deleteUser(entry)} style={deleteButton}>Eliminar</button></div></div>)}</div>
      </section>
      <section style={card}><h2 style={title}>Respaldos y recuperación</h2>
        <p style={{ color:'var(--text2)', fontSize:12 }}>Copia diaria automática, copia después de cada cierre y retención de 60 días.</p>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}><button disabled={saving} onClick={createBackup} style={button}>Crear copia ahora</button><a href="/api/backups/export" style={{ ...button, textDecoration:'none' }}>Exportar copia</a></div>
        {backups.map(entry => <div key={entry.name} style={row}><span><b style={{ fontSize:12 }}>{entry.name}</b><small style={{ display:'block', color:'var(--text3)' }}>{new Date(entry.created_at).toLocaleString('es-EC')} · {(entry.size / 1024).toFixed(1)} KB</small></span><button disabled={saving} onClick={() => restoreBackup(entry)} style={dangerButton}>Restaurar</button></div>)}
      </section>
    </>}
  </div>;
}

function PasswordInput({ label, visible, onToggle, ...props }) {
  const toggleLabel = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
  return <label style={passwordGroup}>
    {label && <span style={fieldLabel}>{label}</span>}
    <div style={passwordField}>
    <input {...props} type={visible ? 'text' : 'password'} style={passwordInput}/>
    <button type="button" onClick={onToggle} aria-label={toggleLabel} title={toggleLabel} style={passwordToggle}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
        {!visible && <path d="M3 3l18 18"/>}
      </svg>
    </button>
    </div>
  </label>;
}

const card = { background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:12 };
const title = { fontSize:16, margin:'0 0 12px' };
const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:8 };
const input = { border:'1px solid var(--border)', borderRadius:8, padding:'9px 10px', font:'inherit', minWidth:0 };
const passwordGroup = { display:'flex', flexDirection:'column', gap:4, minWidth:0 };
const fieldLabel = { color:'var(--text2)', fontSize:11, fontWeight:600 };
const passwordField = { position:'relative', minWidth:0 };
const passwordInput = { ...input, width:'100%', height:'100%', paddingRight:44 };
const passwordToggle = { position:'absolute', top:0, right:0, width:42, height:'100%', display:'grid', placeItems:'center', border:0, background:'transparent', color:'var(--text2)', cursor:'pointer' };
const button = { border:0, borderRadius:8, padding:'9px 13px', background:'var(--green)', color:'#fff', fontWeight:600, cursor:'pointer' };
const updatePasswordButton = { ...button, height:42, alignSelf:'end' };
const dangerButton = { ...button, background:'var(--coral)' };
const deleteButton = { ...button, background:'#fff', color:'var(--coral)', border:'1px solid var(--coral)' };
const userActions = { display:'flex', gap:7, alignItems:'center' };
const row = { display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' };
