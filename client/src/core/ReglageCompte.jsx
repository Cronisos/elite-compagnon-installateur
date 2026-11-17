// Paramètres → Mon compte : tout ce qui est à toi dans l'app, au même endroit. Ton commandant (lu dans tes journaux),
// le serveur et le jeton de l'escadron, l'IA de bord, le dossier où tout est rangé, et « Effacer mes données ».
// L'app elle-même ne contient rien de personnel : installée chez quelqu'un d'autre, elle démarre vide.
// La version de l'app et l'empreinte de son paquet (npm run paquet), vérifiée sur ses fichiers par l'app de bureau :
// à comparer à celle que publie celui qui distribue l'app (une « version corrigée » d'un inconnu ne l'a pas).
//
// Les modules sont lus par leur API (jamais leur code) : un module absent (version escadron sans l'IA) n'a pas de ligne.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api.js';
import { bureau as pont, texteVersion } from './bureau.js';
import { useGameState } from './useGameState.js';

const MOT = 'EFFACER';

export default function ReglageCompte() {
  const { game } = useGameState();
  const [bureau, setBureau] = useState(null);
  const [escadron, setEscadron] = useState(null);
  const [chef, setChef] = useState(null);
  const [ia, setIa] = useState(null);
  const [version, setVersion] = useState(null);
  const [effacer, setEffacer] = useState(false);
  const [mot, setMot] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/bureau').then(setBureau).catch(() => {});
    api('/modules/escadron/status').then(setEscadron).catch(() => {});
    // Chef qui a monté ou repris le serveur de l'escadron : ses clés sont ici, et partent avec « Effacer mes données »
    api('/modules/escadron/chef').then((c) => setChef(c?.serveur ? c : null)).catch(() => {});
    api('/modules/ia/etat').then((e) => setIa(e?.reglages ?? null)).catch(() => {});
    pont?.version?.().then(setVersion).catch(() => {});
  }, []);

  async function toutEffacer(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/bureau/effacer', { method: 'POST', body: { confirmation: mot } });
      setMessage('L’app se relance et efface tes données…');
    } catch (err) {
      setMessage(err.message);
    }
  }

  const cmdr = game?.commander || escadron?.commander || null;
  const ligneVersion = texteVersion(version);
  return (
    <section className="panel" data-tuto="parametres-compte">
      <h2>Mon compte</h2>
      <p className="small muted">
        Tout ce qui est à toi reste sur ce PC{bureau?.donnees ? <>, dans <code>{bureau.donnees}</code></> : null}. L’app
        elle-même n’en contient rien : installée chez quelqu’un d’autre, elle démarre vide, avec ses propres réglages.
      </p>
      <dl className="kv">
        <dt>Commandant</dt>
        <dd>{cmdr ? `CMDR ${cmdr}` : '—'} <span className="muted small">· lu dans tes journaux, rien à régler</span></dd>
        {escadron && (
          <>
            <dt>Escadron</dt>
            <dd>
              {escadron.worker ? 'serveur de ton escadron' : 'aucun serveur d’escadron réglé'} ·{' '}
              {escadron.hasToken ? <>jeton <code>{escadron.token}</code></> : 'aucun jeton'} ·{' '}
              {escadron.enabled ? 'envoi activé' : 'rien ne part'}
              {' '}<Link to="/escadron/rejoindre" className="small">Rejoindre l’escadron →</Link>
            </dd>
          </>
        )}
        {ia && (
          <>
            <dt>Alicia</dt>
            <dd>
              {ia.actif ? 'allumée' : 'coupée'} · sur ce PC (Ollama), sans compte ni clé · modèles {ia.leger} / {ia.moyen} / {ia.grand}
              {' '}<Link to="/ia" className="small">Régler →</Link>
            </dd>
          </>
        )}
        <dt>Mots de passe</dt>
        {chef ? (
          <dd>
            le jeton d’escadron, et les clés du serveur de l’escadron que tu gères (clé de chef, clé du suivi, mot de
            passe), gardés à part et jamais montrés en entier. Garde ton code de gestion en lieu sûr : sans lui, tu ne
            pourrais plus gérer ce serveur après un effacement.
            {' '}<Link to="/escadron/chef" className="small">Serveur de l’escadron →</Link>
          </dd>
        ) : (
          <dd>aucun : le seul secret est le jeton d’escadron, gardé à part et jamais montré en entier</dd>
        )}
        {ligneVersion && (
          <>
            <dt>Version</dt>
            <dd>
              {ligneVersion.texte}
              {ligneVersion.detail && <span className={`small ${ligneVersion.ok === false ? 'bad' : 'muted'}`}> · {ligneVersion.detail}</span>}
              {ligneVersion.ok !== null && <span className="muted small"> · compare cette empreinte à celle publiée par celui qui t’a donné l’app</span>}
            </dd>
          </>
        )}
        <dt>Application</dt>
        <dd className="muted small">Elite Compagnon, créé par Cronisos Lysiris. Gratuit, en libre service, non affilié à Frontier Developments.</dd>
      </dl>

      {!effacer ? (
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setEffacer(true)}>Effacer mes données…</button>
        </div>
      ) : (
        <form className="form" onSubmit={toutEffacer}>
          <p className="warn small">
            Efface tout ce qui est à toi : repères, plans, builds, sessions, réglages, jeton d’escadron, mémoire d’Alicia,
            places des fenêtres (sur le bureau et en jeu), journal de l’app et connexion aux sites (Inara). Sans retour.
            Tes journaux du jeu ne sont pas touchés, ni les données de référence (publiques). L’app se relance, vide,
            comme au premier jour.
          </p>
          {chef && (
            <p className="bad small">
              Tu gères le serveur de l’escadron depuis ce PC : ses clés (clé de chef, clé du suivi, mot de passe) partent
              aussi. Avant d’effacer, affiche ton code de gestion et garde-le en lieu sûr, sinon tu ne pourras plus gérer
              ce serveur. <Link to="/escadron/chef">Serveur de l’escadron →</Link>
            </p>
          )}
          {!bureau?.bureau && <p className="bad small">Seulement depuis l’app de bureau.</p>}
          <label>
            Tape {MOT} pour confirmer
            <input value={mot} onChange={(e) => setMot(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <div className="form-actions">
            <button className="btn btn-danger-on" type="submit" disabled={mot !== MOT || !bureau?.bureau}>Tout effacer</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setEffacer(false); setMot(''); setMessage(''); }}>Annuler</button>
            {message && <span className="small">{message}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
