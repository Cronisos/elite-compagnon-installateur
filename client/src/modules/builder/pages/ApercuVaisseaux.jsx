// Tous les vaisseaux du jeu, en cartes (Builds → Tous les vaisseaux) : de quoi choisir avant de faire un build d'un
// vaisseau qu'on n'a pas. Tri par ce qui compte pour l'usage (saut pour l'exploration, soute et compartiments pour le
// transport, points d'emport pour le combat), filtre par taille. Données : GET /builder/ships/apercu (apercu.js).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { builderApi } from '../api.js';
import { compact, int } from '../../../core/format.js';

const PAD = { 1: { court: 'P', long: 'Petit' }, 2: { court: 'M', long: 'Moyen' }, 3: { court: 'G', long: 'Grand' } };
const EMPORT = [[4, 'É', 'énorme'], [3, 'G', 'grand'], [2, 'M', 'moyen'], [1, 'P', 'petit']];
const nbEmport = (v) => Object.values(v.emport).reduce((a, n) => a + n, 0);
const sommeInternes = (v) => v.internes.reduce((a, n) => a + n, 0);
const dec1 = (n) => (n == null ? '—' : n.toFixed(1).replace('.', ','));

// Ce que le vaisseau peut embarquer (apercu.js, capacitesDe) : cases à cocher du filtre et pastilles des cartes
const CAPACITES = [
  ['rhino', 'Rhino', 'Grand hangar de véhicule planétaire : le seul qui porte le VRS Rhino'],
  ['srv', 'SRV', 'Hangar de véhicule planétaire'],
  ['vehiculesMk2', 'Hangar SRV Mk II', 'Grand hangar de véhicule planétaire Mk II'],
  ['chasseurs', 'Chasseurs', 'Hangar à chasseurs'],
  ['chasseursMk2', 'Chasseurs Mk II', 'Hangar à chasseurs Mk II'],
  ['souteMk2', 'Soute Mk II', 'Soutes Mk II (plus de tonnes par compartiment)'],
  ['droneMinageMk2', 'Drones minage Mk II', 'Contrôleur multi-drones de minage Mk II'],
  ['passagers', 'Passagers', 'Cabines passagers'],
  ['luxe', 'Cabines de luxe', 'Cabines passagers luxe'],
  ['militaires', 'Compartiments militaires', 'Renforts et boucliers dans des compartiments à part'],
];

// Tris : [libellé, valeur, du plus grand au plus petit ?]
const TRIS = {
  sautMax: ['Saut max', (v) => v.sautMax ?? 0, true],
  souteMax: ['Soute max', (v) => v.souteMax, true],
  internes: ['Compartiments (taille totale)', sommeInternes, true],
  emport: ["Points d'emport", (v) => EMPORT.reduce((a, [s]) => a + (v.emport[s] || 0) * s, 0), true],
  vitesse: ['Vitesse', (v) => v.vitesse ?? 0, true],
  bouclier: ['Bouclier + coque de base', (v) => (v.bouclier || 0) + (v.coque || 0), true],
  sautOrigine: ["Saut d'origine", (v) => v.sautOrigine ?? 0, true],
  prix: ['Prix', (v) => v.prix ?? 0, false],
  nom: ['Nom', (v) => v.name, false],
};

function Carte({ v, tri, besoins }) {
  const emport = EMPORT.filter(([s]) => v.emport[s]).map(([s, c, l]) => ({ s, c, l, n: v.emport[s] }));
  return (
    <article className="panel apercu-carte" data-tuto="builds-apercu-carte">
      <header className="apercu-tete">
        <h3>{v.name}</h3>
        <span className={`apercu-pad pad-${v.pad}`} title={`Pad ${PAD[v.pad]?.long.toLowerCase()}`}>{PAD[v.pad]?.court}</span>
      </header>
      <p className="small muted apercu-prix">{v.prix ? `${compact(v.prix)} cr` : '—'} · équipage {v.equipage ?? '—'} · {int(v.masse)} t</p>
      <dl className="apercu-chiffres">
        <div className={tri === 'sautMax' ? 'is-tri' : ''}>
          <dt>Saut max</dt>
          <dd>{dec1(v.sautMax)} <small>AL</small></dd>
        </div>
        <div className={tri === 'souteMax' ? 'is-tri' : ''}>
          <dt>Soute max</dt>
          <dd>{int(v.souteMax)} <small>t</small></dd>
        </div>
        <div className={tri === 'vitesse' ? 'is-tri' : ''}>
          <dt>Vitesse</dt>
          <dd>{v.vitesse ?? '—'} <small>/ {v.boost ?? '—'}</small></dd>
        </div>
      </dl>
      <div className={`apercu-ligne ${tri === 'emport' ? 'is-tri' : ''}`}>
        <span className="apercu-cle">Points d'emport</span>
        <span>
          {emport.length ? emport.map((e) => <span key={e.s} className={`apercu-puce t${e.s}`} title={`${e.n} ${e.l}${e.n > 1 ? 's' : ''}`}>{e.n} {e.c}</span>) : 'aucun'}
          <span className="small muted"> · {v.utilitaires} utilitaire{v.utilitaires > 1 ? 's' : ''}</span>
        </span>
      </div>
      <div className={`apercu-ligne ${tri === 'internes' ? 'is-tri' : ''}`}>
        <span className="apercu-cle">Compartiments ({v.internes.length})</span>
        <span className="apercu-tailles">
          {v.internes.map((s, i) => <span key={i} className={`apercu-taille t${Math.min(8, s)}`}>{s}</span>)}
          {v.militaires.length > 0 && <span className="small muted" title="Compartiments militaires : renforts, boucliers, pas de soute"> + mil. {v.militaires.join(' ')}</span>}
        </span>
      </div>
      <div className="apercu-ligne">
        <span className="apercu-cle">Réacteur FSD</span>
        <span>classe {v.fsd} <span className="small muted">· saut d'origine {dec1(v.sautOrigine)}{' '}AL</span></span>
      </div>
      <div className="apercu-capacites">
        {CAPACITES.filter(([k]) => k !== 'srv' && k !== 'passagers' && v.capacites?.[k]).map(([k, l, t]) => (
          <span key={k} className={`apercu-capa ${besoins.includes(k) ? 'is-cherche' : ''}`} title={t}>{l}</span>
        ))}
        {v.capacites?.srv && !v.capacites.rhino && <span className="apercu-capa is-discret" title="Hangar de véhicule planétaire, sans le grand hangar du Rhino">SRV ×{v.srvMax}</span>}
      </div>
      {v.exclusifs?.length > 0 && <p className="tiny muted apercu-exclusifs">Exclusif : {v.exclusifs.join(' · ')}</p>}
      <div className={`apercu-ligne ${tri === 'bouclier' ? 'is-tri' : ''}`}>
        <span className="apercu-cle">Bouclier / coque</span>
        <span>{v.bouclier ?? '—'} / {v.coque ?? '—'} <span className="small muted">· maniabilité {'●'.repeat(v.maniabilite || 0)}{'○'.repeat(Math.max(0, 5 - (v.maniabilite || 0)))}</span></span>
      </div>
      <div className="form-actions apercu-actions" data-tuto="builds-apercu-creer">
        <Link className="btn small btn-primary" to={`/builder/nouveau?modele=${v.id}`}>Créer un build</Link>
      </div>
    </article>
  );
}

export default function ApercuVaisseaux() {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tri, setTri] = useState('sautMax');
  const [pad, setPad] = useState('');
  const [texte, setTexte] = useState('');
  const [besoins, setBesoins] = useState([]); // capacités cochées : toutes exigées
  useEffect(() => {
    builderApi.apercu().then(setListe).catch((e) => setErreur(e.message));
  }, []);

  const montres = useMemo(() => {
    if (!liste) return [];
    const [, val, desc] = TRIS[tri];
    const t = texte.trim().toLowerCase();
    return liste
      .filter((v) => !pad || String(v.pad) === pad)
      .filter((v) => !t || v.name.toLowerCase().includes(t))
      .filter((v) => besoins.every((k) => v.capacites?.[k]))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const c = typeof x === 'string' ? x.localeCompare(y, 'fr') : desc ? y - x : x - y;
        return c || a.name.localeCompare(b.name, 'fr');
      });
  }, [liste, tri, pad, texte, besoins]);

  if (erreur) return <p className="bad">{erreur}</p>;
  if (!liste) return <p className="muted">Calcul des vaisseaux…</p>;
  return (
    <div className="page">
      <section className="panel apercu-filtres">
        <label data-tuto="builds-apercu-tri">Trier par
          <select value={tri} onChange={(e) => setTri(e.target.value)}>
            {Object.entries(TRIS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label data-tuto="builds-apercu-taille">Taille
          <select value={pad} onChange={(e) => setPad(e.target.value)}>
            <option value="">toutes</option>
            {Object.entries(PAD).map(([k, p]) => <option key={k} value={k}>{p.long}</option>)}
          </select>
        </label>
        <label data-tuto="builds-apercu-nom">Nom
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Python, Type-…" />
        </label>
        <span className="small muted">{montres.length} vaisseau{montres.length > 1 ? 'x' : ''} sur {liste.length}</span>
        <div className="apercu-besoins" data-tuto="builds-apercu-besoins">
          <span className="small muted">Doit pouvoir porter :</span>
          {CAPACITES.map(([k, l, t]) => (
            <label key={k} className="check" title={t}>
              <input type="checkbox" checked={besoins.includes(k)} onChange={(e) => setBesoins((b) => (e.target.checked ? [...b, k] : b.filter((x) => x !== k)))} />
              {l}
            </label>
          ))}
          {besoins.length > 0 && <button className="btn btn-ghost small" onClick={() => setBesoins([])}>Tout décocher</button>}
        </div>
      </section>
      <div className="apercu-grille">
        {montres.map((v) => <Carte key={v.id} v={v} tri={tri} besoins={besoins} />)}
        {montres.length === 0 && <p className="muted">Aucun vaisseau ne coche tout ça.</p>}
      </div>
      <p className="small muted" data-tuto="builds-apercu-legende">
        <b>Saut max</b> : configuration d'exploration, la même pour tous pour qu'ils se comparent. Meilleur réacteur FSD
        (normal ou SCO) en Increased Range G5 avec Mass Manager, plus gros booster gardien, autres modules de base en D,
        blindage et réservoir d'origine, sans armes ni internes, plein fait. Sans ingénierie de poids sur le reste : un
        build d'explo poussé gagne encore quelques AL. <b>Saut d'origine</b> : le vaisseau tel que vendu. <b>Soute
        max</b> : la plus grande soute permise dans chaque compartiment interne. Points d'emport : É énorme, G grand, M
        moyen, P petit. Capacités : ce que le jeu accepte dans au moins un compartiment (le Rhino ne tient que dans le grand hangar de véhicule planétaire). Données EDSY.
      </p>
    </div>
  );
}
