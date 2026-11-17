// Serveur de l'escadron (/escadron/chef) : gérer le tableau Powerplay de l'escadron sans console. Deux façons :
//   A. le monter sur son propre compte Cloudflare (une clé collée, l'app fait tout) ;
//   B. reprendre un serveur existant (celui d'un autre membre, monté pour tout l'escadron) avec son code de gestion.
// Ensuite : le code de l'escadron à poster sur Discord, la route (reprise du Projet extension, envoyée au serveur, mise
// à jour quand un système change), la carte Discord sur GitHub, les membres et le mot de passe.

import { useEffect, useMemo, useState } from 'react';
import RolesChef from './RolesChef.jsx';
import { Link } from 'react-router';
import { bilanEnvois } from './view.js';
import { api } from '../../core/api.js';
import { Commande, Etape, Site } from './guide.jsx';

const base = '/modules/escadron/chef';
const LIEN_CLE_CF = 'https://dash.cloudflare.com/profile/api-tokens';
const LIEN_CLE_GH = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Elite%20Compagnon%20escadron';
const OBJECTIF = { fortified: 'Consolidé', stronghold: 'Forteresse', target: 'Prise' }; // rôles du Projet extension
const MERITES = { Prise: 480_000, 'Consolidé': 1_880_000, Forteresse: 4_480_000 };
const empreinte = (r) => JSON.stringify([r?.power, (r?.stops ?? []).map((s) => [s.name, s.goal])]);

/** Début de la semaine Powerplay en cours (jeudi 7 h UTC), au format du suivi. */
function debutSemaine(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7));
  while (d.getUTCDay() !== 4 || d > now) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export default function GuideChef() {
  const [puissanceJeu, setPuissanceJeu] = useState(''); // ta puissance, d'après tes journaux (synthèse de l'état du jeu)
  const [vue, setVue] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [facon, setFacon] = useState('monter');
  // Monter
  const [cleCf, setCleCf] = useState('');
  const [mdp, setMdp] = useState('');
  const [sousDomaine, setSousDomaine] = useState('');
  const [demandeSousDomaine, setDemandeSousDomaine] = useState(false);
  const [existant, setExistant] = useState(false); // un serveur tourne déjà sur ce compte : remplacement à confirmer
  const [remplacer, setRemplacer] = useState(false);
  // Reprendre
  const [codeGestion, setCodeGestion] = useState('');
  const [main, setMain] = useState({ url: '', cleChef: '', cleSuivi: '', motDePasse: '' }); // reprise à la main
  const [enLigne, setEnLigne] = useState(null);
  // Route et carte
  const [projets, setProjets] = useState([]);
  const [projetId, setProjetId] = useState('');
  const [route, setRoute] = useState(null);
  const [routeServeur, setRouteServeur] = useState(null);
  const [webhook, setWebhook] = useState('');
  const [cleGh, setCleGh] = useState('');

  const charger = () => api(base).then(setVue).catch((e) => setError(e.message));
  const chargerRoute = () => api(`${base}/route/lire`, { method: 'POST' }).then(setRouteServeur).catch(() => setRouteServeur(null));
  useEffect(() => {
    charger();
    api('/modules/expansion/projects').then((p) => setProjets(Array.isArray(p) ? p : [])).catch(() => {});
    api('/etat-jeu').then((e) => setPuissanceJeu(e?.powerplay?.puissance ?? '')).catch(() => {});
  }, []);
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => api(base).then(setVue).catch(() => {}), 800);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    if (!vue?.serveur) return;
    api(`${base}/en-ligne`, { method: 'POST' }).then((r) => setEnLigne(r.enLigne)).catch(() => setEnLigne(false));
    chargerRoute();
  }, [vue?.serveur?.url]);
  // Route reprise du projet choisi : les systèmes à prendre, dans l'ordre (ceux déjà tenus ne sont pas dessinés)
  // Reconstruite seulement quand le projet change : une saisie (titre, objectifs) n'est jamais écrasée par un chargement
  useEffect(() => {
    const p = projets.find((x) => String(x.id) === String(projetId)) ?? projets[0];
    if (!p) return;
    if (!projetId) setProjetId(String(p.id));
    setRoute((r) => ({
      title: p.name.toUpperCase().slice(0, 60),
      subtitle: r?.subtitle ?? '',
      power: r?.power ?? '',
      since: r?.since ?? debutSemaine(),
      theme: r?.theme ?? 'orange',
      stops: (p.steps ?? []).filter((s) => OBJECTIF[s.role]).map((s) => ({ name: s.name, goal: OBJECTIF[s.role], merits: MERITES[OBJECTIF[s.role]] })),
    }));
  }, [projets, projetId]);
  // Puissance et date de départ : remplies une fois, si elles sont encore vides (jamais par-dessus une saisie)
  useEffect(() => {
    const puissance = routeServeur?.route?.power || puissanceJeu;
    if (puissance) setRoute((r) => (r && !r.power ? { ...r, power: puissance } : r));
  }, [puissanceJeu, routeServeur?.route?.power, route === null]);
  useEffect(() => {
    const depart = routeServeur?.route?.since;
    if (depart) setRoute((r) => (r ? { ...r, since: depart } : r));
  }, [routeServeur?.route?.since]);

  const differe = useMemo(() => route && routeServeur?.route && empreinte(route) !== empreinte(routeServeur.route), [route, routeServeur]);

  async function run(fn, ok) {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.serveur !== undefined) setVue(r);
      if (ok) setInfo(ok);
      return r ?? true;
    } catch (e) {
      setError(e.message);
      if (/workers\.dev : choisis/.test(e.message)) setDemandeSousDomaine(true);
      if (/tourne déjà sur ce compte/.test(e.message)) setExistant(true);
      return null;
    } finally {
      setBusy(false);
      charger();
    }
  }

  async function monter(e) {
    e.preventDefault();
    const body = { cloudflare: cleCf, motDePasse: mdp, sousDomaine: sousDomaine || undefined, remplacer: existant && remplacer };
    if (await run(() => api(`${base}/serveur`, { method: 'POST', body }), existant && remplacer
      ? 'Serveur remplacé et en ligne : réinstalle la carte Discord (étape 4), ses clés ont changé.'
      : 'Serveur en ligne.')) {
      setCleCf('');
      setDemandeSousDomaine(false);
      setExistant(false);
      setRemplacer(false);
    }
  }

  async function reprendre(e) {
    e.preventDefault();
    const body = codeGestion.trim() ? { code: codeGestion } : { url: main.url, cleChef: main.cleChef, cleSuivi: main.cleSuivi || undefined, motDePasse: main.motDePasse || undefined };
    const r = await run(() => api(`${base}/relier`, { method: 'POST', body }));
    if (r) {
      setInfo(r.serveur?.ancien
        ? 'Clés gardées, mais ce serveur date d’avant cette version : remonte-le (étape 1) avec ta clé Cloudflare. Il gardera ses clés, ses membres et ses mérites.'
        : 'Serveur repris : tu le gères depuis ce PC.');
      setCodeGestion('');
      setMain({ url: '', cleChef: '', cleSuivi: '', motDePasse: '' });
    }
  }

  async function envoyerRoute() {
    if (await run(() => api(`${base}/route`, { method: 'PUT', body: { route } }), 'Route envoyée : la carte la prend à sa prochaine mise à jour (15 min au plus).')) chargerRoute();
  }

  async function installer(e) {
    e.preventDefault();
    if (await run(() => api(`${base}/suivi`, { method: 'POST', body: { github: cleGh, webhook, route } }), 'Suivi installé : la carte arrive dans le salon d’ici une à deux minutes.')) {
      setCleGh('');
      chargerRoute();
    }
  }

  const serveur = vue?.serveur;
  const setStop = (i, champ, v) => setRoute((r) => ({ ...r, stops: r.stops.map((s, j) => (j === i ? { ...s, [champ]: v, ...(champ === 'goal' ? { merits: MERITES[v] } : {}) } : s)) }));

  return (
    <div className="page guide">
      <header className="route-header">
        <div>
          <h1>Serveur de l'escadron</h1>
          <p className="muted">
            Pour celui qui gère le tableau Powerplay de l'escadron : le chef, ou un membre qui s'en occupe pour tout le monde.
            Pas de console : l'app fait tout. Les membres, eux, n'ont qu'un code à coller
            (<Link to="/escadron/rejoindre">page Rejoindre l'escadron</Link>).
          </p>
        </div>
      </header>

      {(error || info || busy) && (
        <div className="guide-avis" role="status" aria-live="polite">
          {busy && <p className="muted">En cours{vue?.etape ? ` : ${vue.etape}` : ''}…</p>}
          {!busy && error && <p className="bad">{error}</p>}
          {!busy && info && <p className="good">{info}</p>}
        </div>
      )}

      <section className="panel">
        <h2>Mise en place</h2>
        {!vue ? <p className="muted">Chargement…</p> : (
          <ol className="guide-etapes">
            <Etape
              n={1}
              titre="Le serveur"
              faite={Boolean(serveur)}
              modifier="Modifier ou mettre à jour"
              resume={serveur && (
                <>
                  <code>{serveur.url}</code>{' '}
                  <span className={enLigne ? 'good' : 'muted'}>{enLigne == null ? 'vérification…' : enLigne ? 'en ligne' : 'ne répond pas encore'}</span>
                </>
              )}
            >
              {serveur ? (
                <>
                  <p>
                    <code>{serveur.url}</code>
                    {serveur.compte ? <span className="muted small"> · monté depuis ce PC sur le compte {serveur.compte}</span> : <span className="muted small"> · repris avec un code de gestion</span>}
                  </p>
                  <p className={enLigne ? 'good small' : 'muted small'}>
                    {enLigne == null ? 'Vérification…' : enLigne ? 'Il répond.' : 'Il ne répond pas encore : une adresse workers.dev neuve met parfois quelques minutes à exister.'}
                  </p>
                </>
              ) : (
                <p>Deux façons : tu le montes sur ton compte Cloudflare (gratuit), ou tu reprends celui qu'un autre a déjà monté pour l'escadron.</p>
              )}
              <div className="form-actions">
                <label><input type="radio" name="chef-facon" checked={facon === 'monter'} onChange={() => setFacon('monter')} /> {serveur?.compte ? 'Remonter (mettre à jour) sur mon Cloudflare' : 'Le monter sur mon Cloudflare'}</label>
                <label><input type="radio" name="chef-facon" checked={facon === 'reprendre'} onChange={() => setFacon('reprendre')} /> Reprendre un serveur existant</label>
              </div>
              {facon === 'monter' ? (
                <form className="form" onSubmit={monter}>
                  <p className="small">
                    Compte gratuit : <Site href="https://dash.cloudflare.com/sign-up">Cloudflare</Site>. Puis crée une clé d'API :
                    {' '}<Site href={LIEN_CLE_CF}>Mon profil, Jetons d'API</Site>, <b>Créer un jeton</b>, <b>Créer un jeton personnalisé</b>
                    {' '}(Create Custom Token), avec ces trois autorisations sur <b>Compte</b> (Account) : <b>Workers Scripts</b> : Modifier ;
                    {' '}<b>D1</b> : Modifier ; <b>Paramètres du compte</b> (Account Settings) : Lire. Puis <b>Créer le jeton</b> et copie-le.
                  </p>
                  <label>
                    Clé d'API Cloudflare (pas gardée)
                    <input id="chef-cf" type="password" autoComplete="off" spellCheck={false} value={cleCf} onChange={(e) => setCleCf(e.target.value)} />
                  </label>
                  <label>
                    Mot de passe de l'escadron (il ira dans le code posté pour tous)
                    <input id="chef-mdp" type="text" autoComplete="off" spellCheck={false} value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="12 caractères ou plus, utilisé nulle part ailleurs" />
                  </label>
                  {demandeSousDomaine && (
                    <label>
                      Nom de ton adresse workers.dev (une fois pour toutes)
                      <input id="chef-sd" value={sousDomaine} onChange={(e) => setSousDomaine(e.target.value.toLowerCase())} placeholder="mon-escadron" spellCheck={false} />
                    </label>
                  )}
                  {serveur?.compte && <p className="muted small">Remonter met le serveur à jour (nouvelle version, mot de passe) : membres, mérites et route restent.</p>}
                  {existant && (
                    <label className="warn small">
                      <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} /> Remplacer le serveur déjà en place sur ce compte. Il garde sa base (membres, mérites, route), mais ses clés changent : la carte Discord installée s'arrêtera jusqu'à ce que tu la réinstalles (étape 4). Si tu as ses clés, préfère « Reprendre un serveur existant », puis remonte-le.
                    </label>
                  )}
                  <div className="form-actions">
                    <button className="btn btn-primary" type="submit" disabled={busy || !cleCf.trim() || mdp.length < 8 || (existant && !remplacer)}>{serveur?.compte ? 'Remonter le serveur' : 'Monter le serveur'}</button>
                  </div>
                </form>
              ) : (
                <form className="form" onSubmit={reprendre}>
                  <p className="small">
                    Celui qui a monté le serveur ouvre cette page chez lui, clique <b>Montrer le code de gestion</b> (plus bas) et te
                    l'envoie en privé. Il donne tous les droits : membres, route, carte.
                  </p>
                  <label>
                    Code de gestion
                    <input id="chef-gestion" type="password" autoComplete="off" spellCheck={false} value={codeGestion} onChange={(e) => setCodeGestion(e.target.value)} placeholder="EGC1.…" />
                  </label>
                  <details className="small">
                    <summary>Pas de code de gestion : reprendre à la main (serveur monté sans l'app)</summary>
                    <p className="muted">Les valeurs posées à la création du serveur (secrets ADMIN_TOKEN et TRACKER_TOKEN). Avec la clé du suivi, la carte Discord déjà installée continue de marcher quand tu remontes le serveur.</p>
                    <label>Adresse du serveur<input id="chef-main-url" value={main.url} onChange={(e) => setMain({ ...main, url: e.target.value })} placeholder="https://squadron-tracker-api.….workers.dev" spellCheck={false} /></label>
                    <label>Clé de chef (ADMIN_TOKEN)<input id="chef-main-admin" type="password" autoComplete="off" value={main.cleChef} onChange={(e) => setMain({ ...main, cleChef: e.target.value })} /></label>
                    <label>Clé du suivi (TRACKER_TOKEN, facultative)<input id="chef-main-tracker" type="password" autoComplete="off" value={main.cleSuivi} onChange={(e) => setMain({ ...main, cleSuivi: e.target.value })} /></label>
                    <label>Mot de passe de l'escadron (facultatif, pour afficher le code)<input id="chef-main-mdp" type="text" autoComplete="off" value={main.motDePasse} onChange={(e) => setMain({ ...main, motDePasse: e.target.value })} /></label>
                  </details>
                  <div className="form-actions">
                    <button className="btn btn-primary" type="submit" disabled={busy || !(codeGestion.trim() || (main.url.trim() && main.cleChef.trim()))}>Reprendre ce serveur</button>
                  </div>
                </form>
              )}
            </Etape>

            <Etape n={2} titre="Le code de l'escadron, à poster sur Discord" faite={Boolean(vue.code)}>
              {vue.code ? (
                <>
                  <p>Le même pour tout le monde : chacun le colle dans <b>Rejoindre l'escadron</b> (app) ou dans le plugin EDMC, et son nom de commandant fait le reste. Épingle-le dans un salon réservé à l'escadron.</p>
                  <Commande>{vue.code}</Commande>
                  <p className="small">Toi aussi : <Link to={`/escadron/rejoindre?code=${encodeURIComponent(vue.code)}`}>m'inscrire avec ce code →</Link></p>
                </>
              ) : serveur ? (
                <MotDePasseActuel run={run} />
              ) : <p className="muted">Après l'étape 1.</p>}
            </Etape>

            <Etape
              n={3}
              titre="La route"
              faite={Boolean(routeServeur?.route) && !differe}
              modifier="Modifier la route"
              resume={routeServeur?.route && `${routeServeur.route.title} · ${routeServeur.route.stops.length} systèmes · ${routeServeur.route.power}`}
            >
              {routeServeur?.route ? (
                <p className={differe ? 'warn' : 'small'}>
                  Sur le serveur : {routeServeur.route.title}, {routeServeur.route.stops.length} systèmes (version {routeServeur.version}
                  {routeServeur.updatedAt && `, du ${new Date(routeServeur.updatedAt).toLocaleString('fr-FR')}`}).
                  {differe && ' Elle diffère du projet ci-dessous : envoie-la pour mettre la carte à jour.'}
                </p>
              ) : serveur && <p className="muted small">Aucune route sur le serveur pour l'instant.</p>}
              {projets.length === 0 ? (
                <div className="form-actions">
                  <span className="warn small">Aucune route d'extension pour l'instant.</span>
                  <Link className="btn" to="/extension?onglet=routes">Créer la route</Link>
                  <span className="muted small">(« + Nouvelle route », puis reviens ici)</span>
                </div>
              ) : route && (
                <>
                  <p className="small">
                    Reprise du Projet extension. Un système change (on va à B au lieu de A) : clique « Modifier la route »,
                    remplace le système, enregistre, reviens ici et renvoie la route. La carte se recale toute seule, sans
                    fausse annonce « système validé ».{' '}
                    <Link className="btn btn-ghost small" to="/extension?onglet=routes">Modifier la route</Link>
                  </p>
                  <div className="form-actions">
                    <select id="chef-projet" value={projetId} onChange={(e) => setProjetId(e.target.value)} aria-label="Projet d'extension">
                      {projets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select id="chef-theme" value={route.theme} onChange={(e) => setRoute({ ...route, theme: e.target.value })} aria-label="Couleurs de la carte">
                      <option value="orange">Carte orange</option>
                      <option value="prism">Carte prisme</option>
                    </select>
                  </div>
                  <div className="form">
                    <label>Titre de la carte<input id="chef-titre" value={route.title} maxLength={60} onChange={(e) => setRoute({ ...route, title: e.target.value })} /></label>
                    <label>Sous-titre<input id="chef-sous-titre" value={route.subtitle} maxLength={80} onChange={(e) => setRoute({ ...route, subtitle: e.target.value })} placeholder="DE … À …" /></label>
                    <label>Puissance (écrite comme sur Spansh)<input id="chef-puissance" value={route.power} onChange={(e) => setRoute({ ...route, power: e.target.value })} /></label>
                  </div>
                  <table className="table compact">
                    <thead><tr><th>#</th><th>Système</th><th>Objectif</th></tr></thead>
                    <tbody>
                      {route.stops.map((s, i) => (
                        <tr key={s.name + i}>
                          <td className="muted">{i + 1}</td>
                          <td>{s.name}</td>
                          <td>
                            <select value={s.goal} onChange={(e) => setStop(i, 'goal', e.target.value)} aria-label={`Objectif de ${s.name}`}>
                              {Object.keys(MERITES).map((g) => <option key={g}>{g}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted small">Classement à partir du {new Date(route.since).toLocaleString('fr-FR')}. Les systèmes déjà tenus au départ ne sont pas dessinés. Chaque nom est vérifié sur Spansh avant l'envoi.</p>
                  <div className="form-actions">
                    <button className="btn" type="button" disabled={busy || !serveur || !route.stops.length || !route.power} onClick={envoyerRoute}>
                      {routeServeur?.route ? 'Mettre à jour la route sur le serveur' : 'Envoyer la route au serveur'}
                    </button>
                    {/* Bouton grisé : toujours dire pourquoi */}
                    {!serveur && <span className="warn small">Monte d'abord le serveur (étape 1).</span>}
                    {serveur && !route.stops.length && <span className="warn small">Ce projet n'a aucun système à prendre (Consolidé, Forteresse ou Prise).</span>}
                    {serveur && route.stops.length > 0 && !route.power && <span className="warn small">Écris ta puissance ci-dessus (par exemple « Aisling Duval »).</span>}
                  </div>
                </>
              )}
            </Etape>

            <Etape
              n={4}
              titre="La carte dans le salon Discord (GitHub, 24 h/24)"
              faite={Boolean(vue.suivi)}
              modifier="Réinstaller ou changer de salon"
              resume={vue.suivi && <>Installée sur <Site href={vue.suivi.adresse}>{vue.suivi.depot}</Site></>}
            >
              {vue.suivi && <p>Installée : <Site href={vue.suivi.adresse}>{vue.suivi.depot}</Site>. À refaire seulement pour changer de salon.</p>}
              {!vue.cleSuivi && serveur && <p className="warn small">Il manque la clé du suivi : reprends le serveur avec le code de gestion complet, ou remonte-le. (Une carte déjà installée par celui qui a monté le serveur continue de marcher.)</p>}
              <form className="form" onSubmit={installer}>
                <p className="small">
                  Dans Discord : clic droit sur le salon, <b>Modifier le salon</b>, <b>Intégrations</b>, <b>Webhooks</b>, <b>Nouveau
                  webhook</b>, <b>Copier l'URL du webhook</b>. Mets le salon en lecture seule pour les membres.
                </p>
                <label>
                  Lien du webhook
                  <input id="chef-hook" type="password" autoComplete="off" spellCheck={false} value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
                </label>
                <p className="small">
                  Compte gratuit : <Site href="https://github.com/signup">GitHub</Site>. Clé : <Site href={LIEN_CLE_GH}>nouvelle clé, déjà réglée</Site>
                  {' '}(droits <b>repo</b> et <b>workflow</b>). Choisis la durée la plus courte (<b>Expiration</b> : 1 jour ou 7 jours), <b>Generate token</b>, copie-la.
                  L'app copie le projet sur ton compte, y pose les réglages et allume la mise à jour toutes les 15 minutes. La clé n'est pas gardée ; une fois la
                  carte dans le salon, supprime-la sur GitHub (Settings, Developer settings, Personal access tokens) : la carte n'en a plus besoin.
                </p>
                <label>
                  Clé GitHub
                  <input id="chef-gh" type="password" autoComplete="off" spellCheck={false} value={cleGh} onChange={(e) => setCleGh(e.target.value)} placeholder="ghp_…" />
                </label>
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={busy || !serveur || !vue.cleSuivi || !webhook.trim() || !cleGh.trim() || !route?.stops?.length || !route?.power}>
                    {vue.suivi ? 'Réinstaller la carte' : 'Installer la carte'}
                  </button>
                </div>
              </form>
            </Etape>
          </ol>
        )}
      </section>

      {serveur && <Membres />}
      {serveur && <RolesChef />}
      {serveur && <Gestion vue={vue} busy={busy} run={run} />}
    </div>
  );
}

/** Serveur repris sans le mot de passe : le noter pour afficher le code de l'escadron. */
function MotDePasseActuel({ run }) {
  const [mdp, setMdp] = useState('');
  return (
    <form className="form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`${base}/mot-de-passe-actuel`, { method: 'PUT', body: { motDePasse: mdp } }))) setMdp(''); }}>
      <p className="small">Le code de gestion reçu ne contenait pas le mot de passe de l'escadron. Tape-le pour afficher le code à poster.</p>
      <label>Mot de passe actuel de l'escadron<input id="chef-mdp-actuel" type="text" autoComplete="off" value={mdp} onChange={(e) => setMdp(e.target.value)} /></label>
      <div className="form-actions"><button className="btn" type="submit" disabled={mdp.length < 8}>Afficher le code</button></div>
    </form>
  );
}

/** Membres inscrits : installations, retrait (efface ses mérites), jeton à l'ancienne pour un cas particulier. */
function Membres() {
  const [membres, setMembres] = useState(null);
  const [error, setError] = useState('');
  const [nom, setNom] = useState('');
  const [jeton, setJeton] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [ouvertes, setOuvertes] = useState(null);
  const charger = () => api(`${base}/membres/liste`, { method: 'POST' }).then((r) => setMembres(r.membres)).catch((e) => setError(e.message));
  useEffect(() => {
    charger();
    api(`${base}/inscriptions/lire`, { method: 'POST' }).then((r) => setOuvertes(r.ouvertes)).catch(() => setOuvertes(null));
  }, []);

  async function action(fn) {
    if (occupe) return;
    setError('');
    setOccupe(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setOccupe(false);
    }
  }
  const couper = (cmdr) => window.confirm(`Couper toutes les installations de CMDR ${cmdr} ? Ses mérites restent ; il devra rejoindre de nouveau avec le code.`)
    && action(async () => setMembres((await api(`${base}/membres/${encodeURIComponent(cmdr)}/installations`, { method: 'DELETE' })).membres));
  const inscriptions = (v) => action(async () => setOuvertes((await api(`${base}/inscriptions`, { method: 'PUT', body: { ouvertes: v } })).ouvertes));

  async function donner(cmdr) {
    const deja = membres?.some((m) => m.cmdr.toLowerCase() === cmdr.trim().toLowerCase());
    if (deja && !window.confirm(`CMDR ${cmdr} est déjà inscrit : un nouveau jeton à la main remplace son ancien jeton à la main (ceux obtenus avec le code ne changent pas). Continuer ?`)) return;
    await action(async () => {
      setJeton(null);
      setJeton(await api(`${base}/membres`, { method: 'POST', body: { cmdr } }));
      setNom('');
      charger();
    });
  }
  async function retirer(cmdr) {
    if (!window.confirm(`Retirer CMDR ${cmdr} ? Tous ses jetons sont coupés et ses mérites effacés du classement.`)) return;
    setError('');
    try {
      setMembres((await api(`${base}/membres/${encodeURIComponent(cmdr)}`, { method: 'DELETE' })).membres);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>Membres</h2>
      {error && <p className="bad">{error}</p>}
      {jeton && (
        <div className="warn small">
          <p>Jeton de CMDR {jeton.cmdr}, à lui envoyer en privé (il le colle dans « Ou coller un jeton donné par le chef ») :</p>
          <Commande>{jeton.jeton}</Commande>
          <button className="btn btn-ghost small" type="button" onClick={() => setJeton(null)}>C'est envoyé, effacer</button>
        </div>
      )}
      {ouvertes !== null && (
        <p className={ouvertes ? 'small' : 'warn small'}>
          Inscriptions {ouvertes ? 'ouvertes : le code de l’escadron permet de rejoindre.' : 'fermées : personne ne peut rejoindre, les inscrits continuent d’envoyer.'}{' '}
          <button className="btn btn-ghost small" type="button" disabled={occupe} onClick={() => inscriptions(!ouvertes)}>{ouvertes ? 'Fermer les inscriptions' : 'Rouvrir les inscriptions'}</button>
        </p>
      )}
      {bilanEnvois(membres) && (
        <p className="small" data-tuto="chef-envois">
          {bilanEnvois(membres).texte}.{' '}
          <span className="muted">Le classement, et donc les récompenses, ne comptent que les mérites envoyés par l'app ou le plugin de chacun.</span>
          {bilanEnvois(membres).jamais.length > 0 && <span className="warn"> À relancer : {bilanEnvois(membres).jamais.join(', ')} (inscrit, mais l'envoi n'est sans doute pas activé).</span>}
        </p>
      )}
      {!membres ? <p className="muted">Chargement…</p> : membres.length === 0 ? <p className="muted">Personne n'est encore inscrit.</p> : (
        <table className="table compact">
          <thead><tr><th>Commandant</th><th>Inscrit le</th><th>Dernier mérite reçu</th><th className="right">Installations</th><th /></tr></thead>
          <tbody>
            {membres.map((m) => (
              <tr key={m.cmdr}>
                <td>{m.cmdr}</td>
                <td className="muted small">{m.depuis ? new Date(m.depuis).toLocaleDateString('fr-FR') : '—'}</td>
                <td className={m.dernierEnvoi ? 'small' : 'warn small'}>{m.dernierEnvoi === undefined ? '—' : m.dernierEnvoi ? new Date(m.dernierEnvoi).toLocaleDateString('fr-FR') : 'jamais'}</td>
                <td className="right small">{m.installations ?? '—'}</td>
                <td className="right">
                  <button className="btn btn-ghost small" type="button" disabled={occupe} onClick={() => couper(m.cmdr)} title="PC perdu, ou 10 installations atteintes : ses mérites restent">Couper ses installations</button>
                  <button className="btn btn-ghost small" type="button" disabled={occupe} onClick={() => retirer(m.cmdr)}>Retirer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details className="small">
        <summary>Donner un jeton à la main (plugin d'avant le code)</summary>
        <form className="form-actions" onSubmit={(e) => { e.preventDefault(); donner(nom); }}>
          <input id="chef-membre" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du commandant (sans « CMDR »)" maxLength={64} aria-label="Nom du commandant" />
          <button className="btn" type="submit" disabled={!nom.trim()}>Donner un jeton</button>
        </form>
      </details>
    </section>
  );
}

/** Mot de passe, code de gestion, et « ne plus gérer d'ici ». */
function Gestion({ vue, busy, run }) {
  const [cle, setCle] = useState('');
  const [mdp, setMdp] = useState('');
  const [code, setCode] = useState(null);
  async function changer(e) {
    e.preventDefault();
    if (await run(() => api(`${base}/mot-de-passe`, { method: 'PUT', body: { cloudflare: cle, motDePasse: mdp } }), 'Mot de passe changé : poste le nouveau code ; les membres déjà inscrits ne sont pas touchés.')) {
      setCle('');
      setMdp('');
    }
  }
  async function changerCle() {
    if (!window.confirm('Nouvelle clé de chef : tous les codes de gestion donnés jusqu’ici ne marcheront plus. La carte Discord continue. Continuer ?')) return;
    if (await run(() => api(`${base}/cle-chef`, { method: 'PUT', body: { cloudflare: cle } }), 'Clé de chef changée : les anciens codes de gestion ne marchent plus.')) {
      setCle('');
      setCode(null);
    }
  }
  async function montrerCode() {
    if (!window.confirm('Le code de gestion donne tous les droits sur le serveur (membres, route, carte). Ne le donne qu’à qui gère avec toi, en privé. Le montrer ?')) return;
    try {
      setCode((await api(`${base}/code-gestion`, { method: 'POST' })).code);
    } catch (e) {
      window.alert(e.message);
    }
  }
  async function oublier() {
    if (!window.confirm('Ne plus gérer ce serveur depuis ce PC ? Le serveur continue de tourner ; garde un code de gestion pour le reprendre.')) return;
    await run(() => api(base, { method: 'DELETE' }), 'Ce PC ne gère plus le serveur.');
  }
  return (
    <section className="panel">
      <h2>Gestion</h2>
      <h3>Changer le mot de passe</h3>
      {vue.serveur?.compte ? (
        <form className="form" onSubmit={changer}>
          <p className="muted small">Il a fuité, ou on veut fermer la porte ? Les inscrits gardent leur jeton. Poste ensuite le nouveau code.</p>
          <label>Clé d'API Cloudflare<input id="chef-mdp-cf" type="password" autoComplete="off" value={cle} onChange={(e) => setCle(e.target.value)} /></label>
          <label>Nouveau mot de passe<input id="chef-mdp-nouveau" type="text" autoComplete="off" value={mdp} onChange={(e) => setMdp(e.target.value)} /></label>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy || !cle.trim() || mdp.length < 8}>Changer le mot de passe</button>
            <button className="btn btn-ghost" type="button" disabled={busy || !cle.trim()} onClick={changerCle} title="Un code de gestion a traîné, ou un adjoint est parti">Changer la clé de chef</button>
          </div>
        </form>
      ) : <p className="muted small">Seul celui qui a monté le serveur (son compte Cloudflare) peut changer le mot de passe.</p>}
      <h3>Gérer à deux</h3>
      <p className="muted small">Pour que quelqu'un d'autre gère aussi (le chef, ou toi si c'est le chef qui héberge) : envoie-lui le code de gestion en privé ; il le colle dans « Reprendre un serveur existant ».</p>
      {code ? <Commande>{code}</Commande> : <button className="btn" type="button" onClick={montrerCode}>Montrer le code de gestion</button>}
      <div className="form-actions" style={{ marginTop: '0.8rem' }}>
        <button className="btn btn-ghost small" type="button" disabled={busy} onClick={oublier}>Ne plus gérer ce serveur depuis ce PC</button>
      </div>
    </section>
  );
}
