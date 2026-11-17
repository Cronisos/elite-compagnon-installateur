// Mes commandes : toutes les commandes du jeu reclassées par intention (piloter, voyager, combattre…), avec tes touches,
// une recherche intelligente (nom, synonymes « fsd », « gear », touche « k » ou « maj »), les touches en double, et pour
// chacune où la trouver dans le menu Commandes du jeu (section approximative, et ses voisines dans le menu). Lecture
// seule : l'app ne modifie jamais ton profil de commandes.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../core/api.js';
import { dateTime } from '../../core/format.js';
import { classer, contexteDe, doublons, partagesDe, voisins } from './commandesVue.js';

function Detail({ c, toutes, double }) {
  const v = voisins(toutes, c);
  const ailleurs = partagesDe(toutes, c);
  return (
    <div className="mc-detail">
      <p className="mc-ou">
        <span className="muted">Dans le jeu :</span> Options › Commandes › <b>{c.section}</b>{c.sous && <> › <b>{c.sous}</b></>}
        <span className="mc-approx" title="Déduit de l’ordre de ton fichier de commandes, le même que celui du menu ; les intitulés exacts viendront de captures du menu">approximatif</span>
      </p>
      {(v.avant || v.apres) && (
        <p className="small">
          <span className="muted">Dans la liste du menu, entre</span> {v.avant ? <b>{v.avant.nom}</b> : '—'} <span className="muted">et</span> {v.apres ? <b>{v.apres.nom}</b> : '—'}
        </p>
      )}
      {c.genre === 'reglage' && <p className="small"><span className="muted">Valeur :</span> {c.valeur ?? '—'}</p>}
      {double.length > 0 && <p className="small warn">Même touche que : {double.join(', ')}. Le jeu écoute ces commandes en même temps ({contexteDe(c).nom}) : une seule touche les déclenche toutes.</p>}
      {ailleurs.length > 0 && (
        <p className="small muted">
          Cette touche sert aussi ailleurs, sans gêne (le jeu n'écoute qu'un contexte à la fois) :{' '}
          {ailleurs.map((a) => `${a.nom} (${a.contexte})`).join(', ')}
        </p>
      )}
      <p className="small muted">Nom dans le fichier du jeu : <code>{c.id}</code></p>
    </div>
  );
}

export default function MesCommandesPage() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [intention, setIntention] = useState(null);
  const [filtre, setFiltre] = useState(''); // '', 'assignees', 'libres'
  const [reglages, setReglages] = useState(false);
  const [ouverte, setOuverte] = useState(null);
  useEffect(() => {
    api('/modules/bindings/assignations').then(setD, (e) => setErreur(e.message));
  }, []);
  const dbl = useMemo(() => doublons(d?.entrees || []), [d]);
  if (!d) return <p className="muted">{erreur || 'Chargement…'}</p>;
  if (!d.entrees.length) {
    return (
      <section className="panel" data-tuto="outils-commandes-vide">
        <h1>Mes commandes</h1>
        <p className="muted">
          {d.dossierTrouve ? 'Aucun profil de commandes personnel trouvé : dans le jeu, Options › Commandes, enregistre un profil « Personnalisé ».' : 'Dossier des commandes du jeu introuvable : lance le jeu une fois.'}
        </p>
      </section>
    );
  }
  const groupes = classer(d.entrees, d.intentions, { q, intention, assignees: filtre === 'assignees', libres: filtre === 'libres', reglages });
  const total = groupes.reduce((a, g) => a + g.commandes.length, 0);
  const doublesDe = (c) => [...new Set(c.touches.flatMap((t) => (dbl.get(`${contexteDe(c).id}|${t.texte}`) || []).filter((n) => n !== c.nom)))];

  return (
    <div className="page mc">
      <section className="panel">
        <div className="mc-tete">
          <div>
            <h1>Mes commandes</h1>
            <p className="small muted">
              Profil <b>{d.profil?.nom}</b> ({d.profil?.fichier}), modifié le {dateTime(d.profil?.modifie)} · lu sans jamais être modifié.
            </p>
            {d.autres.map((a) => (
              <p key={a.categorie} className="small warn">
                {a.categorie} : le jeu utilise le profil « {a.profil} »{a.fourni ? ' (fourni avec le jeu)' : ''}, pas celui-ci ; ces commandes-là peuvent différer.
              </p>
            ))}
          </div>
          {dbl.size > 0 && <span className="mc-doublons" title="Même touche pour deux commandes que le jeu écoute en même temps. Une touche partagée entre deux contextes (vol et scanner FSS, par exemple) n'est pas comptée : elle ne gêne pas.">⚠ {dbl.size} touche{dbl.size > 1 ? 's' : ''} en double</span>}
        </div>
        <input
          className="mc-recherche"
          autoFocus
          placeholder="Que veux-tu faire ? « boost », « train », « fsd », « carte »… ou une touche : « k », « maj », « bouton 3 »"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mc-filtres" role="group" aria-label="Filtres" data-tuto="outils-commandes-intentions">
          <button type="button" className={`vx-filtre${!intention ? ' is-on' : ''}`} onClick={() => setIntention(null)}>Tout</button>
          {d.intentions.filter((i) => i.id !== 'reglages').map((i) => (
            <button key={i.id} type="button" className={`vx-filtre${intention === i.id ? ' is-on' : ''}`} onClick={() => setIntention(intention === i.id ? null : i.id)}>
              <span aria-hidden="true">{i.icone}</span> {i.titre}
            </button>
          ))}
        </div>
        <div className="mc-filtres" role="group" aria-label="Touches" data-tuto="outils-commandes-touches">
          {[['', 'Toutes'], ['assignees', 'Avec une touche'], ['libres', 'Sans touche']].map(([id, titre]) => (
            <button key={id || 'toutes'} type="button" className={`vx-filtre${filtre === id ? ' is-on' : ''}`} aria-pressed={filtre === id} onClick={() => setFiltre(id)}>{titre}</button>
          ))}
          <button type="button" className={`vx-filtre${reglages ? ' is-on' : ''}`} aria-pressed={reglages} onClick={() => setReglages(!reglages)}>Réglages (sensibilités…)</button>
          <span className="muted small mc-total">{total} commande{total > 1 ? 's' : ''}</span>
        </div>
      </section>

      {!groupes.length && <p className="muted">Rien ne correspond. Essaie un autre mot, ou une touche.</p>}
      {groupes.map((g) => (
        <section key={g.intention.id} className="panel mc-groupe">
          <h2 className="mc-titre"><span aria-hidden="true">{g.intention.icone}</span> {g.intention.titre} <span className="muted small">{g.commandes.length}</span></h2>
          <ul className="mc-liste">
            {g.commandes.map((c) => {
              const double = doublesDe(c);
              const ouvert = ouverte === c.id;
              return (
                <li key={c.id} className={ouvert ? 'is-ouverte' : ''}>
                  <button type="button" className="mc-ligne" onClick={() => setOuverte(ouvert ? null : c.id)} aria-expanded={ouvert}>
                    <span className="mc-nom">{c.nom}</span>
                    <span className="mc-touches">
                      {c.touches.length ? c.touches.map((t, i) => <kbd key={i} className="mc-touche">{t.texte}</kbd>) : c.genre === 'reglage' ? <span className="muted small">{c.valeur}</span> : <span className="muted small">aucune touche</span>}
                      {double.length > 0 && <span className="mc-double" title={`Même touche que : ${double.join(', ')}`}>⚠</span>}
                    </span>
                  </button>
                  {ouvert && <Detail c={c} toutes={d.entrees} double={double} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="small muted">
        Emplacements dans le menu du jeu : approximatifs, déduits de l’ordre de ton fichier (le même que celui du menu).
        Envoie des captures du menu Commandes pour les rendre exacts. Noms anglais d’origine : EDRefCard (MIT).
      </p>
    </div>
  );
}
