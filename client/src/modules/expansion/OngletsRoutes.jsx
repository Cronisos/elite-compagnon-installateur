// Un onglet par route d'extension (onglets « Routes d'extension » et « Historique des mérites ») : on voit une
// route à la fois, au lieu de toutes les routes l'une sous l'autre ou d'une liste déroulante.
// `extra` : onglets en plus, après les routes ([{ id, label, title }]) ; `disabled` : rien ne change d'onglet
// (une route est ouverte dans l'éditeur).

export default function OngletsRoutes({ projects, selected, onSelect, extra = [], disabled = false, title }) {
  const onglets = [...projects.map((p) => ({ id: String(p.id), label: p.name })), ...extra];
  if (!onglets.length) return null;
  return (
    <nav className="tabs tabs-sous tabs-routes" aria-label="Routes d’extension">
      {onglets.map((o) => (
        <button
          key={o.id}
          type="button"
          className={String(selected) === o.id ? 'active' : ''}
          aria-current={String(selected) === o.id ? 'page' : undefined}
          disabled={disabled && String(selected) !== o.id}
          title={disabled && String(selected) !== o.id ? title : o.title}
          onClick={() => onSelect(o.id)}
        >
          {o.label}
        </button>
      ))}
    </nav>
  );
}
