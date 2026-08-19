import { useEffect, useState } from 'react';
import Mesas from './pages/Mesas.jsx';
import Ventas from './pages/Ventas.jsx';
import Cierre from './pages/Cierre.jsx';
import Carta from './pages/Carta.jsx';
import Inventario from './pages/Inventario.jsx';
import CajaChica from './pages/CajaChica.jsx';
import Reportes from './pages/Reportes.jsx';
import Cuentas from './pages/Cuentas.jsx';
import Seguridad from './pages/Seguridad.jsx';
import Desayunos from './pages/Desayunos.jsx';

const NAV = [
  { key:'mesas',      label:'Mesas',          icon:'▦', help:'Pedidos y atención' },
  { key:'ventas',     label:'Ventas',         icon:'◷', help:'Movimientos del día' },
  { key:'cuentas',    label:'Cuentas',        icon:'◎', help:'Huéspedes y propietarios' },
  { key:'desayunos',  label:'Desayunos',      icon:'☀', help:'Control de huéspedes' },
  { key:'inventario', label:'Inventario',     icon:'▣', help:'Existencias y entradas' },
  { key:'caja',       label:'Caja chica',     icon:'$', help:'Ingresos y egresos' },
  { key:'cierre',     label:'Cierre de caja', icon:'✓', help:'Resumen financiero' },
  { key:'reportes',   label:'Reportes',       icon:'▤', help:'Análisis por período' },
  { key:'carta',      label:'Carta',          icon:'☰', help:'Productos y precios' },
  { key:'seguridad',  label:'Seguridad',      icon:'🔐', help:'Usuarios y respaldos' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [login, setLogin] = useState({ username:'', password:'' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [view, setView] = useState('mesas');
  const [location, setLocationState] = useState(() => localStorage.getItem('river_location') || 'restaurante');
  const current = NAV.find(item => item.key === view);

  useEffect(() => {
    fetch('/api/auth/me').then(async response => {
      if (!response.ok) throw new Error();
      setUser(await response.json());
    }).catch(() => setUser(null)).finally(() => setAuthLoading(false));
  }, []);

  async function submitLogin(event) {
    event.preventDefault(); setLoginError('');
    const response = await fetch('/api/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(login) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setLoginError(result.error || 'No se pudo iniciar sesión');
    setUser(result); setLogin({ username:'', password:'' });
    if (result.must_change_password) setView('seguridad');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method:'POST' }).catch(() => {});
    setUser(null); setView('mesas');
  }

  function setLocation(value) {
    localStorage.setItem('river_location', value);
    setLocationState(value);
  }

  if (authLoading) return <div style={loginShell}><div style={{ color:'#fff' }}>Cargando…</div></div>;
  if (!user) return <div style={loginShell}><form onSubmit={submitLogin} style={loginCard}>
    <img src="/assets/river-paradise-logo.png" alt="River Paradise" style={loginLogo}/><p style={{ margin:'0 0 18px', textAlign:'center', color:'var(--text3)' }}>Ingresa para continuar</p>
    {loginError && <div className="account-message error">{loginError}</div>}
    <input autoFocus required value={login.username} onChange={e => setLogin({ ...login, username:e.target.value })} placeholder="Usuario" style={loginInput}/>
    <div style={passwordField}>
      <input required type={showPassword ? 'text' : 'password'} value={login.password} onChange={e => setLogin({ ...login, password:e.target.value })} placeholder="Contraseña" style={passwordInput}/>
      <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={passwordToggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
          {!showPassword && <path d="M3 3l18 18"/>}
        </svg>
      </button>
    </div>
    <button style={{ width:'100%', border:0, borderRadius:8, padding:10, background:'var(--green)', color:'#fff', fontWeight:700 }}>Iniciar sesión</button>
  </form></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="sidebar-wordmark" aria-label="River Paradise hostería">
          <strong>RIVER<br/>PARADISE</strong>
          <span>hostería</span>
        </div>
      </div>

      <div className="nav-caption">OPERACIÓN</div>
      <nav className="main-nav">
        {NAV.map(item => <button key={item.key} title={item.help} onClick={() => setView(item.key)} className={`nav-button ${view === item.key ? 'active' : ''}`}>
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-copy"><b>{item.label}</b><small>{item.help}</small></span>
        </button>)}
      </nav>

      <div className="sidebar-status"><i/><div><strong>{user.display_name}</strong><span>{user.role === 'admin' ? 'Administrador' : 'Cajero/a'}</span></div></div>
    </aside>

    <div className="workspace">
      <header className="workspace-header">
        <div><h1>{current.label}</h1><p>{current.help}</p></div>
        <div className="header-controls"><label className="location-selector"><span>LOCAL</span><select value={location} onChange={event => setLocation(event.target.value)}><option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option></select></label><div className="today-chip"><span>HOY</span><strong>{new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' })}</strong></div><button onClick={logout} style={{ border:'1px solid var(--border)', background:'#fff', borderRadius:8, padding:'8px 10px' }}>Salir</button></div>
      </header>
      <main className="workspace-content">
        {view === 'mesas' && <Mesas location={location} />}
        {view === 'ventas' && <Ventas location={location} user={user} />}
        {view === 'cierre' && <Cierre location={location} />}
        {view === 'carta' && <Carta />}
        {view === 'inventario' && <Inventario />}
        {view === 'caja' && <CajaChica location={location} />}
        {view === 'reportes' && <Reportes initialLocation={location} />}
        {view === 'cuentas' && <Cuentas location={location} user={user} />}
        {view === 'desayunos' && <Desayunos location={location} user={user} />}
        {view === 'seguridad' && <Seguridad user={user} onUserChange={setUser} />}
      </main>
    </div>
  </div>;
}

const loginShell = { minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'linear-gradient(145deg,#001F3F,#003366)' };
const loginCard = { width:'min(380px,100%)', background:'#fff', borderRadius:16, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,.25)' };
const loginLogo = { display:'block', width:'min(260px,85%)', height:150, objectFit:'contain', margin:'0 auto 8px' };
const loginInput = { width:'100%', boxSizing:'border-box', marginBottom:10, border:'1px solid var(--border)', borderRadius:8, padding:'10px 11px', font:'inherit' };
const passwordField = { position:'relative', marginBottom:10 };
const passwordInput = { ...loginInput, marginBottom:0, paddingRight:44 };
const passwordToggle = { position:'absolute', top:0, right:0, width:42, height:'100%', display:'grid', placeItems:'center', border:0, background:'transparent', color:'var(--text2)', fontSize:19, lineHeight:1 };
