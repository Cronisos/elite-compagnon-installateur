import { useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * Liens contextuels vers les sites externes (Inara, Spansh…) pour un système ou une station.
 * Les modèles de liens appartiennent au module « Applications externes » ; on passe par son
 * API, sans importer son code. Si le module est absent, rien ne s'affiche.
 *
 * @param {object} props
 * @param {'system'|'station'} props.kind
 * @param {object} props.vars { system, station, marketId, systemAddress }
 */
export default function ExternalLinks({ kind, vars, compact = true }) {
  const [links, setLinks] = useState([]);
  const key = JSON.stringify([kind, vars]);
  useEffect(() => {
    const params = new URLSearchParams({ kind, ...Object.fromEntries(Object.entries(vars || {}).filter(([, v]) => v != null && v !== '')) });
    api(`/modules/links/context?${params}`)
      .then((d) => setLinks(d.links))
      .catch(() => setLinks([]));
  }, [key]);

  if (!links.length) return null;
  return (
    <span className={`ext-links ${compact ? 'ext-links-compact' : ''}`}>
      {links.map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" title={l.label} className="ext-link">
          {compact ? shortName(l.label) : l.label} ↗
        </a>
      ))}
    </span>
  );
}

/** « Station sur Inara » → « Inara » */
function shortName(label) {
  const m = /sur (.+)$/.exec(label);
  return m ? m[1] : label;
}
