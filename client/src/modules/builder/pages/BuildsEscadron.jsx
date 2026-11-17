// Builds reçus de l'escadron : à part des tiens. « Copier dans mes builds » l'enregistre chez toi par l'API du
// Constructeur, qui le revérifie en entier (un build impossible dans le jeu est refusé).

import { useState } from 'react';
import { Link } from 'react-router';
import { RecusEscadron } from '../../../core/PartageEscadron.jsx';
import { builderApi } from '../api.js';

/** « 12 modules, dont 7 modifiés » d'après les emplacements du build. */
export function resumeBuild(data) {
  const modules = Object.values(data?.slots && typeof data.slots === 'object' ? data.slots : {}).flatMap((g) => (Array.isArray(g) ? g : [])).filter((s) => s?.modid);
  const modifies = modules.filter((s) => s.bpid).length;
  if (!modules.length) return 'aucun module';
  return `${modules.length} module${modules.length > 1 ? 's' : ''}${modifies ? `, dont ${modifies} modifié${modifies > 1 ? 's' : ''}` : ''}`;
}

export default function BuildsEscadron() {
  const [dernier, setDernier] = useState(null);
  return (
    <>
      {dernier && <p className="small good">« {dernier.name} » est dans tes builds. <Link to={`/builder/build/${dernier.id}`}>L’ouvrir →</Link></p>}
      <RecusEscadron
        kinds={['build']}
        copier="Copier dans mes builds"
        vide="Aucun build partagé pour l’instant. Pour partager l’un des tiens : ouvre-le, puis « Partager à l’escadron »."
        onCopier={async (s) => {
          const notes = [s.data.notes, `Reçu de CMDR ${s.cmdr}`].filter(Boolean).join('\n');
          setDernier(await builderApi.create({ name: s.data.name || s.title, shipId: s.data.shipId, slots: s.data.slots, notes }));
        }}
        detail={(s) => (
          <>
            <span className="pill pill-info">{s.data.ship || s.data.shipType || 'Vaisseau'}</span> {resumeBuild(s.data)}
            {s.data.notes && <div className="muted">{String(s.data.notes).slice(0, 300)}</div>}
          </>
        )}
      />
    </>
  );
}
