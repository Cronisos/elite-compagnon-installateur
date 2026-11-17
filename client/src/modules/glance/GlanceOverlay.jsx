import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import GlancePanel from './GlancePanel.jsx';

/**
 * Bouton toujours visible et raccourci Alt+C : ouvre ou ferme le Coup d'œil par-dessus
 * n'importe quelle page. Échap le ferme.
 */
export default function GlanceOverlay() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const onPage = location.pathname.startsWith('/coup-doeil');

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (onPage) return null;
  return (
    <>
      <button className="glance-fab" onClick={() => setOpen(!open)} title="Coup d'œil (Alt+C)">
        👁 Coup d'œil <kbd>Alt+C</kbd>
      </button>
      {open && (
        <div className="glance-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside className="glance-drawer">
            <header className="glance-drawer-head">
              <h2>Coup d'œil</h2>
              <span className="form-actions">
                <Link to="/coup-doeil" className="btn small" onClick={() => setOpen(false)}>Plein écran</Link>
                <button className="btn btn-ghost small" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
              </span>
            </header>
            <GlancePanel onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
