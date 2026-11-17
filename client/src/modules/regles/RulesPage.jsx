import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../../core/api.js';
import { visibleRules, countByStatus, glossary, findTarget, formatDay, formatNumber } from './search.js';
import './regles.css';

const PILL = { mesuree: 'pill-good', publiee: 'pill-info', 'a-verifier': 'pill-warn' };

function Sources({ sources }) {
  if (!sources.length) return <span>aucune</span>;
  return sources.map((s, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {s.type === 'web' ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
      ) : (
        s.label
      )}
      {s.detail && ` (${s.detail})`}
      {s.date && ` · ${formatDay(s.date)}`}
    </span>
  ));
}

export function RuleCard({ rule, status, titles, target, copied, onCopy }) {
  return (
    <article id={rule.id} className={`regle${target === rule.id ? ' regle-cible' : ''}`}>
      <header className="regle-head">
        <h3>{rule.title}</h3>
        <span className={`pill ${PILL[rule.status] || ''}`} title={status?.help}>{status?.label || rule.status}</span>
      </header>
      <p className="regle-enonce">{rule.statement}</p>

      {rule.values.length > 0 && (
        <div className="regle-valeurs">
          {rule.values.map((v) => (
            <div key={v.key} className="regle-valeur">
              <span className="regle-valeur-label">{v.label}</span>
              <span>
                <strong className="num">{formatNumber(v.value)}</strong> <span className="muted">{v.unit}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {rule.terms.length > 0 && (
        <p className="regle-termes">
          {rule.terms.map((t) => (
            <span key={`${t.fr}-${t.en}`} className="regle-terme" title={t.note || 'Terme du jeu en français ↔ terme des guides anglais'}>
              <strong>{t.fr}</strong> <span className="muted">↔</span> <em lang="en">{t.en}</em>
              {t.note && <span className="muted"> *</span>}
            </span>
          ))}
        </p>
      )}

      {rule.evidence.length > 0 && (
        <div className="regle-bloc">
          <h4>Preuves</h4>
          <ul>{rule.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {rule.caveats.length > 0 && (
        <div className="regle-bloc">
          <h4>À savoir</h4>
          <ul>{rule.caveats.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <footer className="regle-pied small">
        <div>
          <span className="muted">{rule.checkedAt ? `Vérifiée le ${formatDay(rule.checkedAt)}` : 'Jamais vérifiée'}</span>
          <span className="muted"> · Source : </span>
          <Sources sources={rule.sources} />
        </div>
        {rule.related.length > 0 && (
          <div>
            <span className="muted">Voir aussi : </span>
            {rule.related.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <Link to={{ hash: `#${id}` }}>{titles.get(id) || id}</Link>
              </span>
            ))}
          </div>
        )}
        {rule.journal.length > 0 && (
          <div className="muted" title="Ce que la vigie des règles pourra lire pour vérifier cette règle">
            Journal : {rule.journal.map((j, i) => <span key={j}>{i > 0 && ', '}<code>{j}</code></span>)}
          </div>
        )}
        <button type="button" className="btn btn-ghost regle-lien" onClick={() => onCopy(rule.id)} title={`Adresse : /regles#${rule.id}`}>
          🔗 {copied === rule.id ? 'Lien copié' : 'Copier le lien'}
        </button>
      </footer>
    </article>
  );
}

/**
 * Règles du jeu en français : fiches Powerplay, mérites de vente, colonisation et escadrons, avec le terme anglais,
 * le statut, la date de vérification et la source. Recherche, filtre par statut et par fiche, lexique.
 * Lien profond vers une règle : /regles#identifiant (un bouton « pourquoi ? » d'un autre module y mène).
 */
export default function RulesPage() {
  const [ref, setRef] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sheet, setSheet] = useState('all');
  const [target, setTarget] = useState(null);
  const [jump, setJump] = useState(0);
  const [copied, setCopied] = useState(null);
  const stay = useRef(false); // lien copié : la carte est déjà sous les yeux, pas de défilement
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api('/modules/regles').then(setRef).catch((e) => setError(e.message));
  }, []);

  // Lien profond (à chaque navigation, même vers la même adresse) : la cible est montrée même si la recherche ou un filtre la cachait
  useEffect(() => {
    if (!ref) return;
    const t = findTarget(location.hash, ref);
    setTarget(t?.id ?? null);
    if (!t) return;
    const shownNow = visibleRules(ref.rules, { q, status, sheet });
    const hidden =
      (t.kind === 'rule' && !shownNow.some((r) => r.id === t.id)) ||
      (t.kind === 'sheet' && !shownNow.some((r) => r.sheet === t.id)) ||
      (t.kind === 'glossary' && (status !== 'all' || sheet !== 'all' || glossary(ref.rules, q).length === 0));
    if (hidden) {
      setQ('');
      setStatus('all');
      setSheet('all');
    }
    setJump((n) => n + 1);
  }, [ref, location.hash, location.key]);

  // Défilement vers la cible, après l'affichage qui suit la remise à zéro des filtres
  useEffect(() => {
    if (stay.current) stay.current = false;
    else if (target) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [jump]);

  const statuses = useMemo(() => new Map((ref?.statuses || []).map((s) => [s.id, s])), [ref]);
  const titles = useMemo(() => new Map((ref?.rules || []).map((r) => [r.id, r.title])), [ref]);
  const shown = useMemo(() => visibleRules(ref?.rules, { q, status, sheet }), [ref, q, status, sheet]);
  const counts = useMemo(() => countByStatus(ref?.rules, { q, sheet }), [ref, q, sheet]);
  const terms = useMemo(() => glossary(ref?.rules, q), [ref, q]);

  async function copyLink(id) {
    stay.current = true;
    navigate({ hash: `#${id}` }, { replace: true });
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/regles#${id}`);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopied(null); // presse-papiers refusé : l'adresse reste dans la barre du navigateur
    }
  }

  if (!ref) return <p className="muted">{error || 'Chargement…'}</p>;
  const total = ref.rules.length;
  const inSheet = (s) => shown.filter((r) => r.sheet === s.id);
  const showGlossary = status === 'all' && sheet === 'all' && terms.length > 0;

  return (
    <div className="page regles">
      <header className="route-header">
        <div>
          <h1>Règles du jeu</h1>
          <p className="muted">
            En français, avec le terme des guides anglais, le statut, la date de vérification et la source de chaque règle.
            Mis à jour le {formatDay(ref.updatedAt) || '—'}.
          </p>
        </div>
      </header>

      {ref.errors > 0 && (
        <p className="warn">
          {ref.errors} erreur{ref.errors > 1 ? 's' : ''} dans le fichier des règles : les règles mal formées sont écartées
          (détail dans la fenêtre du serveur).
        </p>
      )}

      <section className="panel regles-outils">
        <input
          type="search"
          className="regles-recherche"
          placeholder="Chercher : Consolidé, Fortified, 390, portée, sape…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Chercher une règle"
        />
        <div className="regles-filtres" role="group" aria-label="Filtrer par statut" data-tuto="outils-regles-statuts">
          <button type="button" className={`btn ${status === 'all' ? 'btn-primary' : ''}`} onClick={() => setStatus('all')}>
            Tous les statuts
          </button>
          {ref.statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn ${status === s.id ? 'btn-primary' : ''}`}
              onClick={() => setStatus(status === s.id ? 'all' : s.id)}
              title={s.help}
            >
              {s.label} <span className="regles-compte">{counts.get(s.id) || 0}</span>
            </button>
          ))}
        </div>
        <div className="regles-filtres" role="group" aria-label="Filtrer par fiche" data-tuto="outils-regles-fiches">
          <button type="button" className={`btn btn-ghost ${sheet === 'all' ? 'regles-fiche-active' : ''}`} onClick={() => setSheet('all')}>
            Toutes les fiches
          </button>
          {ref.sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn btn-ghost ${sheet === s.id ? 'regles-fiche-active' : ''}`}
              onClick={() => setSheet(sheet === s.id ? 'all' : s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
        <p className="small muted regles-legende">
          {ref.statuses.map((s) => (
            <span key={s.id}>
              <span className={`pill ${PILL[s.id] || ''}`}>{s.label}</span> {s.help}{' '}
            </span>
          ))}
        </p>
        <p className="small muted">
          {shown.length === total ? `${total} règles` : `${shown.length} règle${shown.length > 1 ? 's' : ''} sur ${total}`}
          {' · '}
          <Link to={{ hash: '#lexique' }}>Lexique français ↔ anglais</Link>
        </p>
      </section>

      {shown.length === 0 && <p className="muted">Aucune règle ne correspond. Essaie le terme anglais, ou retire un filtre.</p>}

      {ref.sheets.map((s) => {
        const list = inSheet(s);
        if (!list.length) return null;
        return (
          <section key={s.id} id={s.id} className={`panel regles-fiche${target === s.id ? ' regle-cible' : ''}`}>
            <h2>{s.title}</h2>
            {s.summary && <p className="muted">{s.summary}</p>}
            {list.map((r) => (
              <RuleCard key={r.id} rule={r} status={statuses.get(r.status)} titles={titles} target={target} copied={copied} onCopy={copyLink} />
            ))}
          </section>
        );
      })}

      {showGlossary && (
        <section id="lexique" className={`panel${target === 'lexique' ? ' regle-cible' : ''}`}>
          <h2>Lexique</h2>
          <p className="muted small">
            Le terme français de l'app et du jeu, et celui des guides anglais. * : terme de l'app, libellé exact du jeu en
            français à vérifier. Le journal du jeu n'écrit que les termes anglais.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>En français</th>
                  <th>Guides anglais</th>
                  <th>Règles</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={`${t.fr}-${t.en}`}>
                    <td title={t.note || undefined}>
                      <strong>{t.fr}</strong>
                      {t.note && <span className="muted"> *</span>}
                    </td>
                    <td>
                      <em lang="en">{t.en}</em>
                    </td>
                    <td className="small">
                      {t.rules.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ', '}
                          <Link to={{ hash: `#${id}` }}>{titles.get(id) || id}</Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
