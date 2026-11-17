// Discussion avec l'IA de bord : messages et zone de saisie. Commune à sa page, au volet de la fenêtre principale et
// à la fenêtre en jeu.

import { useEffect, useRef, useState } from 'react';
import { time } from '../../core/format.js';
import { blocs } from './iaVue.js';

const CSS = `
.ia-disc { display: flex; flex-direction: column; min-height: 0; gap: .6rem; }
.ia-fil { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: .7rem; padding: .2rem .1rem; }
.ia-vide { color: var(--muted); font-size: .92rem; }
.ia-vide li { margin: .2rem 0; }
.ia-vide button { all: unset; cursor: pointer; color: var(--accent); }
.ia-msg { display: flex; gap: .55rem; align-items: flex-end; max-width: 92%; }
.ia-msg.is-moi { align-self: flex-end; flex-direction: row-reverse; }
.ia-av { flex: none; width: 34px; height: 34px; border-radius: 50%; overflow: hidden; background: var(--panel-2);
  border: 1px solid rgba(var(--acc-rgb), .45); display: grid; place-items: center; color: var(--accent); font-size: 15px; }
.ia-av img { width: 100%; height: 100%; object-fit: cover; }
.ia-bulle { padding: .5rem .75rem; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border-strong);
  line-height: 1.4; overflow-wrap: anywhere; }
.ia-msg.is-moi .ia-bulle { background: var(--accent-soft); border-color: rgba(var(--acc-rgb), .45); }
.ia-msg.is-erreur .ia-bulle { border-color: var(--bad); background: var(--bad-soft); }
.ia-bulle p { margin: 0 0 .3rem; }
.ia-bulle p:last-child, .ia-bulle ul:last-child { margin-bottom: 0; }
.ia-bulle ul { margin: 0 0 .3rem; padding-left: 1.1rem; }
.ia-meta { display: block; margin-top: .25rem; font-size: .72rem; color: var(--muted); }
.ia-leger { color: var(--warn); }
.ia-pense .ia-bulle { color: var(--muted); font-style: italic; }
.ia-saisie { display: flex; gap: .5rem; align-items: flex-end; }
.ia-saisie textarea { flex: 1; resize: none; min-height: 2.5rem; max-height: 8rem; }
`;

const EXEMPLES = [
  'Il me reste combien de place en soute ?',
  'Ma dernière session de minage, ça a donné quoi ?',
  'Je suis où, et qui contrôle le système ?',
  'Combien j’ai de vaisseaux ?',
];

/** Corps d'une réponse : paragraphes et listes, gras compris. */
function Texte({ texte }) {
  const groupes = [];
  for (const b of blocs(texte)) {
    const dernier = groupes.at(-1);
    if (b.liste && dernier?.liste) dernier.items.push(b);
    else groupes.push(b.liste ? { liste: true, items: [b] } : b);
  }
  const ligne = (b) => b.morceaux.map((m, i) => (m.gras ? <b key={i}>{m.texte}</b> : <span key={i}>{m.texte}</span>));
  return groupes.map((g, i) => (g.items ? <ul key={i}>{g.items.map((b, j) => <li key={j}>{ligne(b)}</li>)}</ul> : <p key={i}>{ligne(g)}</p>));
}

function Avatar({ copilote }) {
  return <span className="ia-av">{copilote?.avatar ? <img src={copilote.avatar} alt="" /> : '✶'}</span>;
}

/**
 * @param ia      retour de useIa()
 * @param compact volet (moins d'exemples)
 */
export default function Discussion({ ia, compact = false }) {
  const [texte, setTexte] = useState('');
  const fil = useRef(null);
  const { messages, occupe, copilote, envoyer, erreur } = ia;
  const nom = copilote?.nom || 'Alicia';

  useEffect(() => {
    if (fil.current) fil.current.scrollTop = fil.current.scrollHeight;
  }, [messages.length, occupe]);

  const envoi = (q = texte) => {
    const t = q.trim();
    if (!t || occupe) return;
    setTexte('');
    envoyer(t);
  };

  return (
    <div className="ia-disc">
      <style>{CSS}</style>
      <div className="ia-fil" ref={fil}>
        {messages.length === 0 && (
          <div className="ia-vide">
            <p>Pose une question à {nom} : il lit tes données dans l’app (crédits, vaisseau, soute, minage, combat, Powerplay) et répond ici et dans sa bulle.</p>
            <ul>
              {EXEMPLES.slice(0, compact ? 2 : 4).map((q) => <li key={q}><button type="button" onClick={() => envoi(q)}>« {q} »</button></li>)}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ia-msg ${m.role === 'user' ? 'is-moi' : ''} ${m.erreur ? 'is-erreur' : ''}`}>
            {m.role === 'assistant' && <Avatar copilote={copilote} />}
            <div className="ia-bulle">
              <Texte texte={m.texte} />
              <span className="ia-meta">
                {time(m.at)}
                {m.modele && ` · ${m.modele}`}
                {(m.version === 'leger' || (!m.version && m.leger)) && <span className="ia-leger"> · version légère (le jeu prend de la place)</span>}
                {m.version === 'moyen' && <span className="ia-leger"> · version intermédiaire{m.carte != null && m.carte < 100 ? ` (${m.carte} % sur la carte)` : ''}</span>}
                {m.sec != null && ` · ${String(m.sec).replace('.', ',')} s`}
                {m.nonVerifiee && <span className="ia-leger"> · ⚠ chiffres non vérifiés (aucune donnée lue)</span>}
                {m.outils?.length > 0 && ` · a lu : ${[...new Set(m.outils)].join(', ')}`}
              </span>
            </div>
          </div>
        ))}
        {occupe && (
          <div className="ia-msg ia-pense">
            <Avatar copilote={copilote} />
            <div className="ia-bulle">{nom} réfléchit…</div>
          </div>
        )}
      </div>
      {erreur && <p className="bad tiny">{erreur}</p>}
      <form className="ia-saisie" onSubmit={(e) => { e.preventDefault(); envoi(); }}>
        <textarea
          rows={1}
          maxLength={1000}
          placeholder={`Ta question à ${nom}…`}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              envoi();
            }
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={occupe || !texte.trim()}>Envoyer</button>
      </form>
    </div>
  );
}
