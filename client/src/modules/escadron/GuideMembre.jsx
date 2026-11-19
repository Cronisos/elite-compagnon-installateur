// Rejoindre l'escadron (/escadron/rejoindre) : le pas à pas du membre, avec les vrais réglages de l'app à chaque étape
// (code de l'escadron, envoi), cochés une fois faits ; puis le même chemin avec le plugin EDMC.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { Commande, Etape, Site } from './guide.jsx';
import { rejoindreAvecCode } from './rejoindre.js';

const base = '/modules/escadron';

export default function GuideMembre() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [serveur, setServeur] = useState(null); // adresse tapée à la main (réglage avancé ; null : rien de tapé)
  // Code de l'escadron, jamais gardé ; ?code= : venue de la page du chef (« m'inscrire aussi »)
  const [code, setCode] = useState(params.get('code') ?? '');
  const [cmdr, setCmdr] = useState('');
  const [since, setSince] = useState('max');
  const [jeton, setJeton] = useState(''); // jeton donné à la main par le chef (réglage avancé), jamais gardé affiché
  const [jetonCmdr, setJetonCmdr] = useState('');
  useEffect(() => {
    api(`${base}/status`).then(setStatus).catch((e) => setError(e.message));
  }, []);
  useEvent('escadron:update', setStatus);

  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      const vue = await fn();
      if (vue) setStatus(vue); // null : le joueur a renoncé
      return Boolean(vue);
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function utiliserServeur(e) {
    e.preventDefault();
    if (status.hasToken && !window.confirm('Changer de serveur efface ton jeton (il ne vaut que pour l’ancien). Continuer ?')) return;
    if (await run(() => api(`${base}/worker`, { method: 'PUT', body: { url: serveur ?? '' } }))) setServeur(null);
  }

  async function oublierServeur() {
    if (status.hasToken && !window.confirm('Oublier ce serveur efface ton jeton : tu ne seras plus inscrit depuis ce PC. Continuer ?')) return;
    if (await run(() => api(`${base}/worker`, { method: 'PUT', body: { url: '' } }))) setServeur(null);
  }

  async function enregistrerJeton(e) {
    e.preventDefault();
    if (await run(() => api(`${base}/token`, { method: 'PUT', body: jetonCmdr ? { token: jeton, cmdr: jetonCmdr } : { token: jeton } }))) {
      setJeton('');
      setJetonCmdr('');
    }
  }

  async function rejoindre(e) {
    e.preventDefault();
    await run(() => rejoindreAvecCode(code, cmdr || undefined));
    setCode(''); // jamais gardé, même après un refus
  }

  const commanders = status?.commanders ?? [];
  const pret = status && status.hasToken && status.enabled;

  return (
    <div className="page guide">
      <header className="route-header">
        <div>
          <h1>Rejoindre l'escadron</h1>
          <p className="muted">
            Cinq minutes, une seule fois. Ensuite, chaque mérite Powerplay que tu gagnes compte dans le classement de
            l'escadron, sur Discord, sans rien faire de plus.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Ce qu'il te faut</h2>
        <ul className="guide-liste">
          <li>Le <b>code de l'escadron</b>, posté par le chef sur Discord (il commence par <code>ESC1.</code>). C'est le même pour tout le monde.</li>
          <li>Avoir lancé le jeu au moins une fois sur ce PC, en galaxie Live.</li>
        </ul>
        <p className="muted small">
          Ce qui part de ton PC : ton nom de commandant, le système, les mérites gagnés et l'heure. Rien d'autre. Ton nom
          est celui du jeu : c'est lui qui s'affiche dans le classement. Tu peux passer par l'app (A) ou par le plugin EDMC
          (B), ou les deux : le serveur ne compte qu'une fois un même gain.
        </p>
      </section>

      {error && <p className="bad">{error}</p>}

      <section className="panel">
        <h2>A. Avec Enova</h2>
        <p className="muted small">L'app rattrape aussi les mérites gagnés quand elle était fermée, jusqu'à 30 jours. C'est le chemin conseillé.</p>
        {!status ? <p className="muted">Chargement…</p> : (
          <ol className="guide-etapes">
            <Etape
              n={1}
              titre="Coller le code de l'escadron"
              faite={status.hasToken}
              modifier="Changer d'escadron ou de code"
              resume={status.hasToken && (
                <>
                  Inscrit{status.chosenCmdr || status.tokenCmdr ? ` comme CMDR ${status.tokenCmdr || status.chosenCmdr}` : ''} sur{' '}
                  <code>{status.worker ?? 'serveur inconnu'}</code>
                </>
              )}
            >
              {status.hasToken && (
                <p>
                  Inscrit{status.chosenCmdr || status.tokenCmdr ? ` : CMDR ${status.tokenCmdr || status.chosenCmdr}` : ''}, sur{' '}
                  <code>{status.worker ?? 'serveur inconnu'}</code>.
                </p>
              )}
              <form className="form" onSubmit={rejoindre}>
                <label>
                  {status.hasToken ? 'Rejoindre à nouveau (autre code, autre escadron)' : 'Code de l’escadron'}
                  <input id="guide-code" type="password" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ESC1.…" />
                </label>
                {commanders.length > 1 && (
                  <label>
                    Commandant à inscrire
                    <select id="guide-cmdr" value={cmdr} onChange={(e) => setCmdr(e.target.value)}>
                      <option value="">— choisir —</option>
                      {commanders.map((n) => <option key={n} value={n}>CMDR {n}</option>)}
                    </select>
                  </label>
                )}
                <p className="muted small">
                  Ton nom de commandant ({commanders.length === 1 ? `CMDR ${commanders[0]}` : 'celui du jeu'}) est ton
                  identifiant : rien d'autre à retenir. Le code part une fois au serveur de l'escadron et n'est pas gardé.
                  Tu peux rejoindre depuis plusieurs PC, ou avec l'app et le plugin en même temps.
                  {commanders.length === 0 && ' Aucun commandant dans tes journaux : lance le jeu une fois.'}
                </p>
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={busy || !code.trim() || (commanders.length > 1 && !cmdr)}>Rejoindre</button>
                </div>
              </form>
              <details className="small">
                <summary>Réglages à la main (rarement utile)</summary>
                <p className="muted">
                  Le code de l'escadron règle déjà tout : l'adresse du serveur et ton inscription. Ceci ne sert que si
                  le chef t'a donné une adresse, un mot de passe ou un jeton séparés.
                </p>
                <p><b>Adresse du serveur.</b> Un serveur public en https. En changer efface ton jeton, qui ne vaut que pour l'ancien.</p>
                <form className="form-actions" onSubmit={utiliserServeur}>
                  <input
                    id="guide-serveur"
                    value={serveur ?? status.worker ?? ''}
                    onChange={(e) => setServeur(e.target.value)}
                    placeholder="https://…"
                    spellCheck={false}
                    aria-label="Adresse du serveur de l'escadron"
                    style={{ minWidth: '20rem' }}
                  />
                  <button className="btn" type="submit" disabled={busy || serveur === null || serveur.trim() === (status.worker ?? '')}>
                    Utiliser ce serveur
                  </button>
                  {status.worker && <button className="btn btn-ghost" type="button" disabled={busy} onClick={oublierServeur}>Oublier ce serveur</button>}
                </form>
                <p><b>Jeton de membre.</b> 43 caractères, donné en privé par le chef à la place du code.</p>
                <form className="form" onSubmit={enregistrerJeton}>
                  <label>
                    {status.hasToken ? 'Remplacer le jeton' : 'Jeton'}
                    <input type="password" autoComplete="off" spellCheck={false} value={jeton} onChange={(e) => setJeton(e.target.value)} />
                  </label>
                  {commanders.length > 1 && (
                    <label>
                      Commandant de ce jeton
                      <select value={jetonCmdr} onChange={(e) => setJetonCmdr(e.target.value)}>
                        <option value="">— à choisir plus tard (rien ne part avant) —</option>
                        {commanders.map((n) => <option key={n} value={n}>CMDR {n}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="form-actions">
                    <button className="btn" type="submit" disabled={busy || !jeton.trim()}>Enregistrer le jeton</button>
                    {status.hasToken && (
                      <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(() => api(`${base}/token`, { method: 'DELETE' }))}>
                        Effacer le jeton
                      </button>
                    )}
                  </div>
                </form>
              </details>
            </Etape>

            <Etape n={2} titre="Activer l'envoi" faite={status.enabled}>
              {status.enabled ? (
                <p>Tes gains partent. <Link to="/escadron">Suivre mes envois →</Link></p>
              ) : (
                <>
                  <p>Choisis depuis quand envoyer. « Des 30 derniers jours » fait compter aussi tes mérites déjà gagnés.</p>
                  <div className="form-actions">
                    <select id="guide-depuis" value={since} onChange={(e) => setSince(e.target.value)} aria-label="Gains à envoyer">
                      {status.sinceChoices.map((c) => <option key={c.id} value={c.id}>Gains {c.label}</option>)}
                    </select>
                    <button className="btn btn-primary" type="button" disabled={busy || !status.hasToken} onClick={() => run(() => api(`${base}/config`, { method: 'PUT', body: { enabled: true, since } }))}>
                      Activer l'envoi
                    </button>
                  </div>
                </>
              )}
            </Etape>
          </ol>
        )}
        {pret && <p className="good">C'est prêt : ton nom apparaîtra au classement à la prochaine mise à jour de la carte (toutes les 15 minutes).</p>}
      </section>

      <section className="panel">
        <h2>B. Avec le plugin EDMC</h2>
        <p className="muted small">Si tu utilises déjà EDMarketConnector. Il ne compte que ce qui arrive pendant qu'EDMC tourne.</p>
        <ol className="guide-etapes">
          <Etape n={1} titre="Installer EDMC">
            <p>Si ce n'est pas fait : <Site href="https://github.com/EDCD/EDMarketConnector/releases">EDMarketConnector</Site>, la dernière version.</p>
          </Etape>
          <Etape n={2} titre="Récupérer le plugin">
            <p>
              Télécharge <code>Squadron_Tracker.zip</code> dans les versions publiées du{' '}
              <Site href="https://github.com/Cronisos/squadron-tracker/releases">dépôt du Squadron Tracker</Site>. Vérifie
              qu'il n'a pas été modifié : dans PowerShell, à côté du fichier,
            </p>
            <Commande>Get-FileHash Squadron_Tracker.zip -Algorithm SHA256</Commande>
            <p className="muted small">Le résultat doit être celui affiché avec la version. Sinon, ne l'installe pas.</p>
          </Etape>
          <Etape n={3} titre="Le mettre dans EDMC">
            <p>Décompresse l'archive et copie le dossier <code>Squadron_Tracker</code> dans le dossier des plugins. Pour l'ouvrir, colle ceci dans la barre d'adresse de l'Explorateur :</p>
            <Commande>%LOCALAPPDATA%\EDMarketConnector\plugins</Commande>
            <p>Relance EDMC, puis lance le jeu une fois pour qu'EDMC connaisse ton commandant.</p>
          </Etape>
          <Etape n={4} titre="Rejoindre">
            <p>Dans EDMC : <b>Fichier</b>, <b>Paramètres</b>, onglet <b>Squadron Tracker</b>. Colle le <b>code de l'escadron</b>,
              clique <b>Rejoindre en tant que …</b> : « Inscrit » s'affiche dessous. Puis <b>OK</b>.</p>
          </Etape>
        </ol>
      </section>

      <section className="panel">
        <h2>Si ça coince</h2>
        <table className="table compact">
          <thead><tr><th>Message</th><th>Quoi faire</th></tr></thead>
          <tbody>
            <tr><td>Code refusé</td><td>Le chef l'a peut-être changé : reprends celui du message épinglé sur Discord.</td></tr>
            <tr><td>Code illisible</td><td>Il a été coupé en le copiant : recopie-le en entier, de <code>ESC1.</code> jusqu'au bout.</td></tr>
            <tr><td>Inscriptions fermées</td><td>Le chef n'a pas encore réglé le mot de passe du serveur.</td></tr>
            <tr><td>Trop d'essais</td><td>Attends une minute.</td></tr>
            <tr><td>Serveur injoignable</td><td>Vérifie l'adresse (<code>https://</code>, sans espace) et ta connexion.</td></tr>
          </tbody>
        </table>
        <p className="muted small">Pas encore dans le classement ? La carte se met à jour toutes les 15 minutes et n'affiche que les dix premiers. La bêta et la galaxie Legacy ne comptent pas.</p>
      </section>
    </div>
  );
}
