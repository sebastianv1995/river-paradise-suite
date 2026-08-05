import { useState } from 'react';
import Mesas from './pages/Mesas.jsx';
import Ventas from './pages/Ventas.jsx';
import Cierre from './pages/Cierre.jsx';
import Carta from './pages/Carta.jsx';
import Inventario from './pages/Inventario.jsx';
import CajaChica from './pages/CajaChica.jsx';
import Reportes from './pages/Reportes.jsx';
import Cuentas from './pages/Cuentas.jsx';

const NAV = [
  { key:'mesas',      label:'Mesas',          icon:'▦', help:'Pedidos y atención' },
  { key:'ventas',     label:'Ventas',         icon:'◷', help:'Movimientos del día' },
  { key:'cuentas',    label:'Cuentas',        icon:'◎', help:'Huéspedes y propietarios' },
  { key:'inventario', label:'Inventario',     icon:'▣', help:'Existencias y entradas' },
  { key:'caja',       label:'Caja chica',     icon:'$', help:'Ingresos y egresos' },
  { key:'cierre',     label:'Cierre de caja', icon:'✓', help:'Resumen financiero' },
  { key:'reportes',   label:'Reportes',       icon:'▤', help:'Análisis por período' },
  { key:'carta',      label:'Carta',          icon:'☰', help:'Productos y precios' },
];

export default function App() {
  const [view, setView] = useState('mesas');
  const [location, setLocationState] = useState(() => localStorage.getItem('river_location') || 'restaurante');
  const current = NAV.find(item => item.key === view);

  function setLocation(value) {
    localStorage.setItem('river_location', value);
    setLocationState(value);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">RP</div>
        <div className="brand-copy"><strong>River Paradise</strong><span>Gestión de restaurante</span></div>
      </div>

      <div className="nav-caption">OPERACIÓN</div>
      <nav className="main-nav">
        {NAV.map(item => <button key={item.key} title={item.help} onClick={() => setView(item.key)} className={`nav-button ${view === item.key ? 'active' : ''}`}>
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-copy"><b>{item.label}</b><small>{item.help}</small></span>
        </button>)}
      </nav>

      <div className="sidebar-status"><i/><div><strong>Sistema local</strong><span>Datos guardados en este equipo</span></div></div>
    </aside>

    <div className="workspace">
      <header className="workspace-header">
        <div><h1>{current.label}</h1><p>{current.help}</p></div>
        <div className="header-controls"><label className="location-selector"><span>LOCAL</span><select value={location} onChange={event => setLocation(event.target.value)}><option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option></select></label><div className="today-chip"><span>HOY</span><strong>{new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' })}</strong></div></div>
      </header>
      <main className="workspace-content">
        {view === 'mesas' && <Mesas location={location} />}
        {view === 'ventas' && <Ventas location={location} />}
        {view === 'cierre' && <Cierre location={location} />}
        {view === 'carta' && <Carta />}
        {view === 'inventario' && <Inventario />}
        {view === 'caja' && <CajaChica location={location} />}
        {view === 'reportes' && <Reportes initialLocation={location} />}
        {view === 'cuentas' && <Cuentas location={location} />}
      </main>
    </div>
  </div>;
}
