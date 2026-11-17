// Bilans de session (Activités › Bilans de session) : chaque session de jeu, la plus récente d'abord, avec durée,
// crédits, mérites, matériaux, morts, sauts, les modes joués, et la comparaison à tes sessions passées (moyennes,
// records). Reconstruit depuis le journal : l'historique est là dès le premier lancement.

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { dateTime, duration } from '../../core/format.js';
import { chiffres, credits, nomMode } from './bilanVue.js';

function Carte({ b, comp }) {
  return (
    <article className={`bl-carte${b.enCours ? ' is-encours' : ''}`} data-tuto="activites-bilans-carte">
      <header className="bl-tete">
        <b>{dateTime(b.debut)}</b>
        <span className="muted small">{b.enCours ? 'en cours' : b.termine ? 'jeu fermé' : 'interrompue'}{b.vaisseaux.length ? ` · ${b.vaisseaux.join(', ')}` : ''}</span>
      </header>
      <dl className="bl-chiffres" data-tuto="activites-bilans-chiffres">
        {chiffres(b, comp).map((c) => (
          <div key={c.label}><dt>{c.label}</dt><dd>{c.valeur}</dd>{c.sous && <span className="small muted">{c.sous}</span>}</div>
        ))}
      </dl>
      {b.modes.length > 0 && (
        <p className="small bl-modes" data-tuto="activites-bilans-modes">{b.modes.map((m) => `${nomMode(m.mode)} ${duration(m.duree / 1000)}`).join(' · ')}</p>
      )}
      {(b.primes > 0 || b.obligations > 0) && (
        <p className="small muted">
          Encaissé : {[b.primes > 0 && `primes ${credits(b.primes)}`, b.obligations > 0 && `obligations ${credits(b.obligations)}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </article>
  );
}

export default function BilansPage() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');
  const charger = () => api('/modules/bilan/sessions').then(setD, (e) => setErreur(e.message));
  useEffect(() => {
    charger();
  }, []);
  useEvent('bilan:update', charger);
  if (!d) return <p className="muted">{erreur || 'Chargement…'}</p>;
  const c = d.comparaison;
  return (
    <div className="page">
      <section className="panel" data-tuto="activites-bilans-tete">
        <h1>Bilans de session</h1>
        <p className="small muted">
          Une session va du chargement de la partie à la fermeture du jeu. Reconstruite depuis ton journal ; les modes de
          jeu sont notés à partir de maintenant (le journal ne les écrit pas).
        </p>
        {c.sessions > 0 && (
          <p className="bl-moyennes" data-tuto="activites-bilans-moyennes">
            Sur tes {c.sessions} dernières sessions : <b>{credits(c.gainHeure)}/h</b> et <b>{c.meritesHeure ?? '—'} mérites/h</b> d’habitude (médiane) ·
            records <b>{credits(c.recordGainHeure)}/h</b>, <b>{c.recordMeritesHeure ?? '—'} mérites/h</b>
          </p>
        )}
      </section>
      {!d.sessions.length && <p className="muted">Aucune session dans ton journal pour l’instant : lance le jeu.</p>}
      <div className="bl-liste">
        {d.sessions.map((b) => <Carte key={b.debut} b={b} comp={c} />)}
      </div>
    </div>
  );
}
