// Rôles d'un vaisseau en tags colorés (core/shipRole.js : tagsRole, COULEURS_ROLE) : le principal plein, les
// secondaires au contour de leur couleur ; « Sans rôle » en gris.

import { tagsRole } from './shipRole.js';

export default function RoleTags({ role }) {
  const tags = tagsRole(role);
  if (!tags.length) return <span className="role-tags"><span className="role-tag is-vide">Sans rôle</span></span>;
  return (
    <span className="role-tags">
      {tags.map((t) => (
        <span key={t.id} className={`role-tag${t.principal ? ' is-principal' : ''}`} style={{ '--c': t.couleur }} title={t.principal ? 'Rôle principal' : 'Rôle secondaire'}>
          {t.icone && <span aria-hidden="true">{t.icone}</span>} {t.label}
        </span>
      ))}
    </span>
  );
}
