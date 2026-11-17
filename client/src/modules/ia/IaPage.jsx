// Page de l'IA de bord (Outils › Alicia) : la discussion en grand, l'état des modèles et de la mémoire vidéo, les réglages.

import { useEffect, useState } from 'react';
import { time } from '../../core/format.js';
import Discussion from './Discussion.jsx';
import { useIa } from './useIa.js';
import { commandeInstallation, libelleMemoire, libelleModele } from './iaVue.js';
import Personnalite from './Personnalite.jsx';

const CSS = `
.ia-page .ia-cadre { height: min(62vh, 640px); display: flex; flex-direction: column; padding: .9rem 1rem; }
.ia-page .ia-cadre .ia-disc { flex: 1; }
.ia-etat { display: grid; grid-template-columns: max-content 1fr; gap: .25rem .9rem; font-size: .9rem; }
.ia-etat dt { color: var(--muted); }
.ia-etat dd { margin: 0; }
.ia-regl { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .7rem; }
.ia-regl label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; color: var(--muted); }
`;

function Reglages({ ia }) {
  const r = ia.etat?.reglages;
  const [brouillon, setBrouillon] = useState(null);
  useEffect(() => setBrouillon(r ? { ...r } : null), [r?.grand, r?.moyen, r?.leger, r?.margeMo, r?.margeJeuMo, r?.garderSec, r?.actif]);
  if (!brouillon) return null;
  const champ = (cle) => ({ value: brouillon[cle], onChange: (e) => setBrouillon({ ...brouillon, [cle]: e.target.value }) });
  const enregistrer = () => ia.regler({
    grand: brouillon.grand.trim(),
    moyen: brouillon.moyen.trim(),
    leger: brouillon.leger.trim(),
    margeMo: Math.round(Number(brouillon.margeMo)),
    margeJeuMo: Math.round(Number(brouillon.margeJeuMo)),
    garderSec: Math.round(Number(brouillon.garderSec)),
  });
  return (
    <>
      <div className="ia-regl" data-tuto="outils-ia-modeles">
        <label>Grand modèle (le plus malin)<input {...champ('grand')} /></label>
        <label>Modèle intermédiaire (en jeu, réparti carte et processeur)<input {...champ('moyen')} /></label>
        <label>Modèle léger (si l’intermédiaire ne tient pas)<input {...champ('leger')} /></label>
        <label>Mémoire toujours libre (Mo) : en dessous, déchargé<input type="number" min={256} max={8192} step={256} {...champ('margeMo')} /></label>
        <label>Mémoire laissée au jeu, modèle réparti (Mo)<input type="number" min={512} max={8192} step={256} {...champ('margeJeuMo')} /></label>
        <label>Déchargé après (secondes sans question)<input type="number" min={0} max={3600} step={30} {...champ('garderSec')} /></label>
      </div>
      <div className="form-actions" style={{ marginTop: '.7rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={enregistrer}>Enregistrer</button>
        <button className="btn" onClick={() => ia.regler({ actif: !r.actif })}>{r.actif ? 'Couper l’IA' : 'Allumer l’IA'}</button>
      </div>
    </>
  );
}

/** Fenêtre en jeu et voix : réglages immédiats. */
function EnJeu({ ia }) {
  const r = ia.etat.reglages;
  return (
    <>
      <div className="form-actions" data-tuto="outils-ia-enjeu" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn ${r.fenetre ? '' : 'btn-primary'}`} onClick={() => ia.regler({ fenetre: !r.fenetre })}>
          🗔 {r.fenetre ? 'Masquer la fenêtre en jeu' : 'Afficher la fenêtre en jeu'}
        </button>
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={r.voix} onChange={(e) => ia.regler({ voix: e.target.checked })} /> Réponses à voix haute
        </label>
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={r.ecoute} onChange={(e) => ia.regler({ ecoute: e.target.checked })} /> Lui parler au micro (Alt+Maj+V)
        </label>
        <select value={r.modeleEcoute} onChange={(e) => ia.regler({ modeleEcoute: e.target.value })} disabled={!r.ecoute}>
          <option value="rapide">Écoute rapide (~1,5 s)</option>
          <option value="precis">Écoute précise (~5 s)</option>
        </select>
      </div>
      {r.ecoute && !ia.etat.ecoute?.pret && (
        <p className="small warn">Whisper (l’écoute) n’est pas installé : il manque {ia.etat.ecoute?.exe} ou {ia.etat.ecoute?.modele}.</p>
      )}
      <p className="tiny muted">
        Pour lui parler : Alt+Maj+V (ou 🎤 dans la fenêtre en jeu), tu parles, Alt+Maj+V encore pour finir. Ta voix est
        transcrite par Whisper sur ton processeur, sans internet ni mémoire vidéo.
        Dans la fenêtre en jeu, passe en mode souris (Alt+Maj+K) pour écrire ta question. La réponse s’y affiche, dans la
        bulle du Compagnon et, si la voix est allumée, à voix haute (voix de Windows, sur ton PC).
      </p>
    </>
  );
}

/** Vue du jeu : coupée par défaut ; seulement la fenêtre d'Elite, jamais l'écran ; jauge des boucliers. */
function VueDuJeu({ ia }) {
  const r = ia.etat.reglages;
  return (
    <>
      <div className="form-actions" data-tuto="outils-ia-vue" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={r.vision} onChange={(e) => ia.regler({ vision: e.target.checked })} /> 👁 Lui permettre de regarder le jeu
        </label>
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={r.visionBouclier} disabled={!r.vision} onChange={(e) => ia.regler({ visionBouclier: e.target.checked })} /> Jauge des boucliers (lue toutes les secondes)
        </label>
        <button className="btn" disabled={!r.vision} onClick={() => ia.cadreBouclier(true)}>Régler la jauge en jeu</button>
        <button className="btn btn-ghost" disabled={!r.vision} onClick={() => ia.cadreBouclier(false)}>Fermer le cadre</button>
      </div>
      {r.vision && !ia.etat.vision?.overlay && <p className="small warn">L’overlay ne s’est pas encore manifesté : la vue marchera dès qu’il tourne (app de bureau).</p>}
      <p className="tiny muted">
        Ce qu’elle voit : <b>seulement la fenêtre d’Elite Dangerous</b>, jamais ton écran ni une autre fenêtre (la
        fenêtre doit appartenir au programme du jeu et porter son titre ; ni Discord, ni ton navigateur, ni même les
        fenêtres de l’app par-dessus le jeu). Une image quand tu lui demandes ce qu’elle voit (outil « regarder l’écran »,
        lue par son modèle, ~5 s), et un petit carré toutes les secondes pour la jauge si tu l’allumes : rien d’autre.
        Les images restent en mémoire sur ton PC, ne sont jamais enregistrées ni envoyées ailleurs. Coupé, plus aucune image.
        Le jeu doit être en plein écran fenêtré (le plein écran exclusif peut donner une image noire).
      </p>
      <p className="tiny muted">
        Jauge des boucliers : « Régler la jauge en jeu » ouvre un cadre ; pose-le (Alt+Maj+C) sur l’hologramme du vaisseau,
        en bas du cockpit. Boucliers tombés (à quai), clique « Tombés » ; boucliers pleins, « Pleins ». Le jeu ne donne
        nulle part leur pourcentage : la jauge le lit sur l’image, environ (si tu tournes la tête, l’hologramme sort du cadre).
      </p>
    </>
  );
}

export default function IaPage() {
  const ia = useIa();
  const { etat } = ia;
  const m = etat?.modeles;
  const manquants = m ? [m.grand, m.moyen, m.leger].filter((x) => x && !x.installe) : [];
  return (
    <div className="page ia-page">
      <style>{CSS}</style>
      <h1>{ia.copilote?.nom || 'Alicia'}</h1>
      <p className="muted">
        Ton IA de bord répond à tes questions : elle lit tes données dans l’app, jamais ailleurs. Le modèle tourne sur ton
        PC (Ollama) : rien ne part sur internet. Son nom et son avatar sont ceux du Compagnon (Outils › Compagnon).
      </p>
      {etat && !etat.reglages.actif && (
        <div className="panel" data-tuto="outils-ia-coupee">
          <p>
            L’IA de bord est coupée. Pour l’utiliser, il te faut le programme Ollama installé sur ce PC et une carte
            graphique avec beaucoup de mémoire vidéo (8 Go au moins pour le modèle léger).
          </p>
          <button className="btn btn-primary" onClick={() => ia.regler({ actif: true })}>Allumer l’IA</button>
        </div>
      )}

      <div className="panel ia-cadre" data-tuto="outils-ia-discussion"><Discussion ia={ia} /></div>
      <div className="form-actions" style={{ marginTop: '.5rem' }}>
        <button className="btn btn-ghost" data-tuto="outils-ia-oublier" onClick={ia.oublier} disabled={!ia.messages.length}>Oublier la conversation</button>
      </div>

      <h2>État</h2>
      {etat?.ollamaErreur && <p className="bad">{etat.ollamaErreur}</p>}
      {etat?.alerte && <p className="warn">⚠ {etat.alerte.texte} ({time(etat.alerte.at)})</p>}
      {etat && (
        <dl className="ia-etat" data-tuto="outils-ia-etat">
          <dt>IA de bord</dt><dd>{etat.reglages.actif ? (etat.occupe ? 'réfléchit…' : 'prêt') : 'coupé'}</dd>
          <dt>Grand modèle</dt><dd>{libelleModele(m?.grand)}</dd>
          <dt>Intermédiaire</dt><dd>{libelleModele(m?.moyen)}</dd>
          <dt>Modèle léger</dt><dd>{libelleModele(m?.leger)}</dd>
          <dt>Mémoire vidéo</dt><dd>{libelleMemoire(etat.memoire)}</dd>
          <dt>Pour le jeu</dt><dd>{(etat.reglages.margeMo / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go toujours laissés libres : sous ce seuil, le modèle chargé est déchargé tout de suite</dd>
        </dl>
      )}
      {manquants.length > 0 && (
        <p className="tiny muted">Pour installer {manquants.length > 1 ? 'les modèles manquants' : 'le modèle manquant'}, dans un terminal : {manquants.map((x) => <code key={x.nom} style={{ marginRight: '.6rem' }}>{commandeInstallation(x.nom)}</code>)}</p>
      )}
      <div className="form-actions" style={{ marginTop: '.5rem' }}>
        <button className="btn" data-tuto="outils-ia-decharger" onClick={ia.decharger}>Rendre la mémoire vidéo maintenant</button>
        <button className="btn btn-ghost" onClick={ia.relire}>↻ Actualiser</button>
      </div>

      <h2>Personnalité</h2>
      {etat && <Personnalite ia={ia} />}

      <h2>En jeu</h2>
      {etat && <EnJeu ia={ia} />}

      <h2>Vue du jeu</h2>
      {etat && <VueDuJeu ia={ia} />}

      <h2>Réglages</h2>
      <Reglages ia={ia} />
      <p className="tiny muted">
        Avant chaque question : le grand s’il tient entièrement sur la carte (hors jeu), sinon l’intermédiaire, réparti
        entre la carte et le processeur sans toucher à la mémoire laissée au jeu, sinon le léger, sinon aucun (le jeu passe
        d’abord). Sans carte NVIDIA, la mémoire libre est inconnue : le léger seulement.
      </p>
    </div>
  );
}
