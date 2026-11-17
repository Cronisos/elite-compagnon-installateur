// Partage avec l'escadron : le bouton « Partager » d'un objet (repère, build, route…), la liste « Reçu de l'escadron »
// d'une rubrique, et le réglage (Paramètres). Tout passe par l'API du module Escadron ; sans lui, rien ne s'affiche.
//
// Rien ne part tout seul : un partage vient toujours d'un clic, vers les destinataires choisis. Ce qui est reçu reste
// à part : c'est le joueur qui copie ce qu'il veut garder.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api.js';
import { tenter } from './actions.js';
import { useEvent } from './stream.js';
import { dateTime } from './format.js';
import Modale from './Modale.jsx';
import { API_PARTAGE, blocage, chiffrementPrevu, choixDepuis, destinatairesAuto, libelleAudience, partageDe, recusDe, valeurAuto, versDestinataires } from './partage.js';

/** L'état du partage (null : module Escadron absent, ou pas encore lu), relu quand il change. */
export function usePartage() {
  const [vue, setVue] = useState(null);
  const lire = () => api(API_PARTAGE).then(setVue).catch(() => setVue(null));
  useEffect(() => { lire(); }, []);
  useEvent('escadron:partage', lire);
  useEvent('escadron:update', lire); // serveur ou jeton changé
  return [vue, setVue];
}

/** Ce qu'il faut faire avant de pouvoir partager : rejoindre, activer, ou faire confirmer l'installation. */
function Blocage({ vue, onVue }) {
  const [erreur, setErreur] = useState(null);
  const raison = blocage(vue);
  if (!raison) return null;
  return (
    <p className="small warn">
      {raison}{' '}
      {!vue.pret && <Link to="/escadron/rejoindre">Rejoindre l’escadron →</Link>}
      {vue.pret && !vue.actif && (
        <button type="button" className="btn small" onClick={() => tenter(async () => onVue(await api(`${API_PARTAGE}/actif`, { method: 'PUT', body: { actif: true } })), setErreur)}>
          Activer le partage
        </button>
      )}
      {erreur && <span className="bad"> {erreur}</span>}
    </p>
  );
}

/** Choix des destinataires : tout l'escadron, un rôle et au-dessus, ou des commandants précis. */
function Destinataires({ vue, choix, setChoix }) {
  const [filtre, setFiltre] = useState('');
  const autres = vue.membres.filter((m) => m.cmdr.toLowerCase() !== (vue.cmdr || '').toLowerCase());
  const visibles = autres.filter((m) => m.cmdr.toLowerCase().includes(filtre.trim().toLowerCase()));
  const nomRole = (id) => vue.roles.find((r) => r.id === id)?.name;
  const basculer = (cmdr) => setChoix({ ...choix, cmdrs: choix.cmdrs.includes(cmdr) ? choix.cmdrs.filter((c) => c !== cmdr) : [...choix.cmdrs, cmdr] });
  return (
    <fieldset className="partage-choix">
      <legend className="small muted">À qui ?</legend>
      <label className="check">
        <input type="radio" name="partage-mode" checked={choix.mode === 'all'} onChange={() => setChoix({ ...choix, mode: 'all' })} /> Tout l’escadron
      </label>
      <label className="check">
        <input type="radio" name="partage-mode" checked={choix.mode === 'role'} disabled={!vue.roles.length} onChange={() => setChoix({ ...choix, mode: 'role', role: choix.role || vue.roles.at(-1)?.id || '' })} />{' '}
        Un rôle et ceux au-dessus
        {!vue.roles.length && <span className="muted small"> · le chef n’a pas encore créé de rôles</span>}
      </label>
      {choix.mode === 'role' && (
        <select value={choix.role} onChange={(e) => setChoix({ ...choix, role: e.target.value })} aria-label="Rôle">
          {vue.roles.map((r) => <option key={r.id} value={r.id}>{r.name} et au-dessus</option>)}
        </select>
      )}
      <label className="check">
        <input type="radio" name="partage-mode" checked={choix.mode === 'cmdrs'} disabled={!autres.length} onChange={() => setChoix({ ...choix, mode: 'cmdrs' })} />{' '}
        Des personnes précises
        {!autres.length && <span className="muted small"> · tu es seul inscrit pour l’instant</span>}
      </label>
      {choix.mode === 'cmdrs' && (
        <>
          {autres.length > 8 && <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un commandant" aria-label="Chercher un commandant" />}
          <div className="partage-membres">
            {visibles.map((m) => (
              <label key={m.cmdr} className="check">
                <input type="checkbox" checked={choix.cmdrs.includes(m.cmdr)} onChange={() => basculer(m.cmdr)} /> {m.cmdr}
                {m.role && nomRole(m.role) && <span className="muted small"> · {nomRole(m.role)}</span>}
                {!m.chiffrable && <span className="muted small" title="Il n'a pas encore ouvert le partage dans une app à jour"> · pas encore de clé</span>}
              </label>
            ))}
            {!visibles.length && <span className="muted small">Personne à ce nom.</span>}
          </div>
          <AvisChiffrement prevu={chiffrementPrevu(vue, choix)} />
        </>
      )}
    </fieldset>
  );
}

/** Sous le choix des personnes : ce partage sera-t-il chiffré de bout en bout, et sinon pourquoi. */
function AvisChiffrement({ prevu }) {
  if (!prevu) return null;
  if (prevu.chiffre) {
    return <p className="small good">Chiffré de bout en bout : il ne peut être lu que par toi et ces personnes. Le serveur de l'escadron, lui, ne le peut pas.</p>;
  }
  if (!prevu.pret) {
    return <p className="small warn">Ce partage partira en clair : le serveur de ton escadron ne gère pas encore le chiffrement (le chef doit le mettre à jour).</p>;
  }
  return (
    <p className="small warn">
      Ce partage partira en clair : {prevu.sansCle.join(', ')} n'{prevu.sansCle.length > 1 ? 'ont' : 'a'} pas encore de clé. Elle se crée toute
      seule quand on active le partage dans une app à jour. Retire {prevu.sansCle.length > 1 ? 'ces personnes' : 'cette personne'} pour un partage chiffré.
    </p>
  );
}

/**
 * Bouton « Partager avec l'escadron » d'un objet. `kind` : son type (« repere-rhino », « build »…), `refId` : son
 * identifiant chez toi (le même objet repartagé remplace l'ancien partage), `titre`, et `donnees()` : ce qui part.
 * Sans `donnees` (builds, routes commerciales), le module Escadron lit lui-même l'objet enregistré, par l'API de sa rubrique.
 * `apercu` : ce que les autres verront, en une ligne.
 */
export function BoutonPartager({ kind, refId, titre, donnees, apercu, className = 'btn btn-ghost' }) {
  const [vue, setVue] = usePartage();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(choixDepuis(null));
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  if (!vue) return null; // module Escadron absent
  const deja = partageDe(vue.miens, kind, refId);
  const vers = versDestinataires(choix);
  const bloque = blocage(vue);

  function ouvrir() {
    setChoix(choixDepuis(deja));
    setErreur(null);
    setOuvert(true);
    // Membres et rôles à jour au moment de choisir (si le partage est utilisable)
    if (!blocage(vue)) api(`${API_PARTAGE}/lire`, { method: 'POST' }).then(setVue).catch(() => {});
  }
  async function agir(action) {
    setEnvoi(true);
    const r = await tenter(action, setErreur);
    setEnvoi(false);
    if (r) {
      setVue(r);
      setOuvert(false);
    }
  }
  const partager = () => agir(() => api(`${API_PARTAGE}/envoyer`, { method: 'POST', body: { kind, ref: String(refId), title: String(titre).slice(0, 80), ...(donnees ? { data: donnees() } : {}), to: vers } }));
  const retirer = () => agir(() => api(`${API_PARTAGE}/${deja.id}`, { method: 'DELETE' }));

  return (
    <>
      <button type="button" className={className} onClick={ouvrir} title={deja ? `Partagé avec ${libelleAudience(deja, vue.roles)}` : 'Partager avec ton escadron'}>
        {deja ? 'Partagé ✓' : 'Partager à l’escadron'}
      </button>
      {ouvert && (
        <Modale
          titre={deja ? 'Partage avec l’escadron' : 'Partager avec l’escadron'}
          onFermer={() => setOuvert(false)}
          pied={(
            <div className="form-actions">
              <button type="button" className="btn btn-primary" disabled={envoi || !vers || Boolean(bloque)} onClick={partager}>{envoi ? 'Envoi…' : deja ? 'Mettre à jour' : 'Partager'}</button>
              {deja && <button type="button" className="btn btn-ghost" disabled={envoi} onClick={retirer}>Ne plus partager</button>}
              <button type="button" className="btn btn-ghost" onClick={() => setOuvert(false)}>Fermer</button>
              {erreur && <span className="small bad">{erreur}</span>}
            </div>
          )}
        >
          <p><b>{titre}</b>{apercu && <span className="muted small"> · {apercu}</span>}</p>
          {deja && <p className="small good">Déjà partagé avec {libelleAudience(deja, vue.roles)}, le {dateTime(deja.updatedAt)}.</p>}
          <Blocage vue={vue} onVue={setVue} />
          {!bloque && <Destinataires vue={vue} choix={choix} setChoix={setChoix} />}
          <p className="tiny muted">
            Seuls toi et les destinataires peuvent le lire, par le serveur de ton escadron. Le chef ne voit que ce qui lui
            est adressé. Tu peux le retirer quand tu veux.
          </p>
        </Modale>
      )}
    </>
  );
}

/**
 * « Reçu de l'escadron » d'une rubrique : les partages de ces types, à part de tes propres données.
 * `detail(s)` : ce qu'on montre d'un partage ; `onCopier(s)` : le copie chez toi (async, facultatif), `copier` : son libellé.
 */
export function RecusEscadron({ kinds, detail, onCopier, copier = 'Copier chez moi', vide = 'Rien de partagé pour l’instant.' }) {
  const [vue, setVue] = usePartage();
  const [erreur, setErreur] = useState(null);
  const [copies, setCopies] = useState({});
  const [lecture, setLecture] = useState(false);
  if (!vue) return <p className="muted">Le partage avec l’escadron n’est pas disponible dans cette version.</p>;
  const bloque = blocage(vue);
  const liste = recusDe(vue, kinds);

  async function relire() {
    setLecture(true);
    const r = await tenter(() => api(`${API_PARTAGE}/lire`, { method: 'POST' }), setErreur);
    setLecture(false);
    if (r) setVue(r);
  }
  const masquer = (s) => tenter(async () => setVue(await api(`${API_PARTAGE}/masques`, { method: 'PUT', body: { id: s.id, masque: true } })), setErreur);
  async function copierChezMoi(s) {
    const ok = await tenter(async () => {
      await onCopier(s);
      return true;
    }, setErreur);
    if (ok) setCopies((c) => ({ ...c, [s.id]: true }));
  }

  return (
    <section className="panel">
      <div className="form-actions">
        <h2>Reçu de l’escadron</h2>
        {!bloque && <button type="button" className="btn btn-ghost small" disabled={lecture} onClick={relire}>{lecture ? 'Lecture…' : 'Actualiser'}</button>}
        {vue.luAt && !bloque && <span className="muted small">lu le {dateTime(vue.luAt)}</span>}
      </div>
      <Blocage vue={vue} onVue={setVue} />
      {erreur && <p className="small bad">{erreur}</p>}
      {!bloque && !liste.length && <p className="muted">{vide}</p>}
      {!bloque && liste.length > 0 && (
        <div className="partage-recus">
          {liste.map((s) => (
            <article key={s.id} className="partage-recu">
              <div>
                <b>{s.title}</b>
                <div className="small muted">
                  de CMDR {s.cmdr} · pour {libelleAudience(s, vue.roles)} · {dateTime(s.updatedAt)}{s.chiffre && ' · chiffré de bout en bout'}
                </div>
                {s.illisible
                  ? <div className="small warn">Chiffré pour une autre de tes installations : illisible ici. Demande à CMDR {s.cmdr} de le partager de nouveau.</div>
                  : detail && <div className="small">{detail(s)}</div>}
              </div>
              <div className="form-actions">
                {onCopier && !s.illisible && <button type="button" className="btn small" disabled={copies[s.id]} onClick={() => copierChezMoi(s)}>{copies[s.id] ? 'Copié ✓' : copier}</button>}
                <button type="button" className="btn btn-ghost small" onClick={() => masquer(s)} title="Le retire de ta liste, sur ce PC seulement">Masquer</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="tiny muted">
        Ce qui est reçu reste ici, à part de tes données : rien n’est ajouté chez toi sans ton clic.
        {vue.masques > 0 && (
          <> {vue.masques} masqué{vue.masques > 1 ? 's' : ''}.{' '}
            <button type="button" className="lien" onClick={() => tenter(async () => setVue(await api(`${API_PARTAGE}/masques`, { method: 'PUT', body: { tout: false } })), setErreur)}>Tout remontrer</button>
          </>
        )}
      </p>
    </section>
  );
}

/**
 * Partage automatique, type par type (Rhino et minage en vaisseau séparés) : jamais, tout l'escadron, ou un rôle et
 * au-dessus. Les types viennent du module Escadron (vue.auto) : la page n'en connaît aucun.
 */
function ReglageAuto({ vue, agir }) {
  if (!vue.auto?.length) return null;
  const regler = (kind, valeur) => agir(() => api(`${API_PARTAGE}/auto`, { method: 'PUT', body: { kind, to: destinatairesAuto(valeur) } }));
  const actifs = vue.auto.some((a) => a.to);
  return (
    <>
      <h3>Partage automatique</h3>
      <p className="small muted">
        Pour chaque type, choisis si tes objets partent tout seuls, et à qui. Un nouveau repère est alors partagé dans les
        deux minutes, tenu à jour si tu le modifies, et retiré si tu le supprimes ou le marques « pas rentable ». Ce que tu
        retires ou partages toi-même à la main n’est plus touché.
      </p>
      <dl className="kv">
        {vue.auto.map((a) => (
          <div key={a.kind} style={{ display: 'contents' }}>
            <dt>{a.label}</dt>
            <dd>
              <select value={valeurAuto(a.to)} onChange={(e) => regler(a.kind, e.target.value)} aria-label={`Partage automatique : ${a.label}`}>
                <option value="">jamais (à la main seulement)</option>
                <option value="all">à tout l’escadron</option>
                {vue.roles.map((r) => <option key={r.id} value={`role:${r.id}`}>à {r.name} et au-dessus</option>)}
                {a.to?.role && !vue.roles.some((r) => r.id === a.to.role) && <option value={`role:${a.to.role}`}>à un rôle supprimé (plus personne)</option>}
                {a.to?.cmdrs && <option value="cmdrs">à {a.to.cmdrs.length} personne{a.to.cmdrs.length > 1 ? 's' : ''} choisie{a.to.cmdrs.length > 1 ? 's' : ''}</option>}
              </select>
              {a.envoyes > 0 && <span className="muted small"> · {a.envoyes} partagé{a.envoyes > 1 ? 's' : ''}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {actifs && (
        <p className="small muted">
          {vue.autoAt ? `Dernier passage le ${dateTime(vue.autoAt)}.` : 'Premier passage en cours…'}{' '}
          <button type="button" className="btn btn-ghost small" onClick={() => agir(() => api(`${API_PARTAGE}/auto/passage`, { method: 'POST' }))}>Partager maintenant</button>{' '}
          <button type="button" className="btn btn-ghost small" onClick={() => agir(() => api(`${API_PARTAGE}/auto/reprendre`, { method: 'POST' }))} title="Ce que tu as retiré ou partagé à la main revient dans le partage automatique">Tout reprendre en automatique</button>
        </p>
      )}
      {vue.autoErreur && <p className="small bad">{vue.autoErreur}</p>}
    </>
  );
}

/** Paramètres : activer ou couper le partage, mon rôle, mes installations à confirmer, et ce que je partage. */
export function ReglagePartage() {
  const [vue, setVue] = usePartage();
  const [erreur, setErreur] = useState(null);
  if (!vue) return null;
  const agir = (fn) => tenter(async () => setVue(await fn()), setErreur);
  const attente = vue.installations.filter((i) => i.attente && !i.ici);
  return (
    <section className="panel">
      <h2>Partage avec l’escadron</h2>
      <p className="small muted">
        Partager un repère, un build ou une route avec ton escadron : à tous, à un rôle et ceux au-dessus, ou à des
        personnes précises. Coupé, l’app ne demande rien au serveur de l’escadron. Rien ne part sans ton clic sur
        « Partager », et ce que tu reçois reste dans l’onglet « Escadron » de chaque rubrique.
      </p>
      <label className="check">
        <input type="checkbox" checked={vue.actif} onChange={(e) => agir(() => api(`${API_PARTAGE}/actif`, { method: 'PUT', body: { actif: e.target.checked } }))} />{' '}
        Activer le partage avec mon escadron
      </label>
      {vue.actif && !vue.pret && <p className="small warn">Rejoins d’abord ton escadron. <Link to="/escadron/rejoindre">Rejoindre l’escadron →</Link></p>}
      {vue.actif && vue.pret && (
        <>
          <dl className="kv">
            <dt>Mon rôle</dt>
            <dd>{vue.role ? vue.role.name : <span className="muted">aucun (le chef de l’escadron les donne)</span>}</dd>
            <dt>Reçus</dt>
            <dd>{vue.recus.length}{vue.masques > 0 && <span className="muted small"> · {vue.masques} masqué{vue.masques > 1 ? 's' : ''}</span>}</dd>
            <dt>Dernière lecture</dt>
            <dd>
              {vue.luAt ? dateTime(vue.luAt) : '—'}{' '}
              <button type="button" className="btn btn-ghost small" onClick={() => agir(() => api(`${API_PARTAGE}/lire`, { method: 'POST' }))}>Actualiser</button>
            </dd>
          </dl>
          {vue.attente && (
            <p className="small warn">
              Cette installation attend d’être confirmée : ouvre l’app sur ton autre PC (Paramètres), ou demande au chef de
              l’escadron. C’est ce qui empêche quelqu’un d’autre de lire tes partages en s’inscrivant sous ton nom.
            </p>
          )}
          {attente.map((i) => (
            <p key={i.id} className="small warn">
              Une autre installation s’est inscrite sous ton nom{i.depuis ? ` le ${dateTime(i.depuis)}` : ''}. Si c’est toi (autre PC,
              réinstallation) :{' '}
              <button type="button" className="btn small" onClick={() => agir(() => api(`${API_PARTAGE}/installations/${i.id}/confirmer`, { method: 'POST' }))}>C’est moi, confirmer</button>
              {' '}Sinon, préviens le chef de l’escadron.
            </p>
          ))}
          {!vue.attente && <ReglageAuto vue={vue} agir={agir} />}
          {vue.miens.length > 0 && (
            <>
              <h3>Ce que je partage</h3>
              <div className="partage-recus">
                {vue.miens.map((s) => (
                  <article key={s.id} className="partage-recu">
                    <div>
                      <b>{s.title}</b>
                      <div className="small muted">avec {libelleAudience(s, vue.roles)} · {dateTime(s.updatedAt)}{s.chiffre && ' · chiffré de bout en bout'}</div>
                    </div>
                    <button type="button" className="btn btn-ghost small" onClick={() => agir(() => api(`${API_PARTAGE}/${s.id}`, { method: 'DELETE' }))}>Ne plus partager</button>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {(erreur || vue.erreur) && <p className="small bad">{erreur || vue.erreur}</p>}
    </section>
  );
}
