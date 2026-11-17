import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import NomSysteme from '../../core/NomSysteme.jsx';
import { Link } from 'react-router';
import { SITES } from '../../core/sitesExternes.js';

const base = '/modules/links';
const linksApi = {
  list: () => api(`${base}/links`),
  context: () => api(`${base}/context`),
  create: (body) => api(`${base}/links`, { method: 'POST', body }),
  update: (id, body) => api(`${base}/links/${id}`, { method: 'PATCH', body }),
  remove: (id) => api(`${base}/links/${id}`, { method: 'DELETE' }),
  reorder: (ids) => api(`${base}/links/reorder`, { method: 'POST', body: { ids } }),
  restore: () => api(`${base}/links/restore-defaults`, { method: 'POST' }),
};

const open = (url) => ({ href: url, target: '_blank', rel: 'noopener noreferrer' });

/**
 * Menu personnel de liens, par thème. Chaque entrée ouvre la page dans le navigateur
 * habituel (nouvel onglet). Liste modifiable : ajouter, renommer, réordonner, supprimer.
 */
export default function LinksPage() {
  const [data, setData] = useState(null);
  const [here, setHere] = useState(null);
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState('');

  const load = () => linksApi.list().then(setData).catch((e) => setError(e.message));
  const loadHere = () => linksApi.context().then(setHere).catch(() => {});
  useEffect(() => {
    load();
    loadHere();
  }, []);
  useEvent('state', () => loadHere()); // la position change : liens « ici et maintenant » à jour

  async function run(fn) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const menu = data.links.filter((l) => !l.kind && l.verified);
  const toCheck = data.links.filter((l) => !l.kind && !l.verified);
  const templates = data.links.filter((l) => l.kind);
  const themes = data.themes.filter((t) => t !== 'Ici et maintenant');
  const extraThemes = [...new Set(menu.map((l) => l.theme))].filter((t) => !themes.includes(t));

  async function move(link, dir) {
    const ids = data.links.map((l) => l.id);
    const sameTheme = data.links.filter((l) => l.theme === link.theme && !!l.kind === !!link.kind && l.verified === link.verified);
    const i = sameTheme.findIndex((l) => l.id === link.id);
    const other = sameTheme[i + dir];
    if (!other) return;
    const a = ids.indexOf(link.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    await run(() => linksApi.reorder(ids));
  }

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Sites et applications</h1>
          <p className="muted">Les sites les plus utiles s'ouvrent dans l'app. Les autres liens s'ouvrent dans un nouvel onglet de ton navigateur.</p>
        </div>
        <div className="form-actions">
          <button className={`btn ${edit ? 'btn-primary' : ''}`} data-tuto="outils-liens-modifier" onClick={() => setEdit(!edit)}>
            {edit ? 'Terminer' : 'Modifier la liste'}
          </button>
        </div>
      </header>
      {error && <p className="bad">{error}</p>}

      <section className="panel" data-tuto="outils-liens-sites">
        <h2>Dans l'app</h2>
        <p className="muted small">
          Chaque site s'affiche dans l'app, isolé du reste : il garde ta connexion à ton compte d'une fois sur l'autre,
          et ne voit rien de l'app ni de ton PC.
        </p>
        <div className="rub-cartes">
          {SITES.map((s) => (
            <Link key={s.id} className="rub-carte" to={`/${s.id}`}>
              <span className="rub-tete"><span className="rub-icone" aria-hidden="true">{s.icone}</span> {s.titre}</span>
              <span className="rub-desc">{s.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel here-panel" data-tuto="outils-liens-ici">
        <h2>Ici et maintenant</h2>
        {here?.vars?.system ? (
          <>
            <p className="muted small">
              {here.vars.station ? `${here.vars.station} · ` : ''}
              <NomSysteme nom={here.vars.system} />
            </p>
            <div className="link-buttons">
              {here.links.map((l) => (
                <a key={l.id} className="btn" {...open(l.url)}>{l.label} ↗</a>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Position inconnue : lance le jeu.</p>
        )}
      </section>

      <div className="links-grid" data-tuto="outils-liens-menu">
        {[...themes, ...extraThemes].map((theme) => {
          const list = menu.filter((l) => l.theme === theme);
          if (!list.length && !edit) return null;
          return (
            <section key={theme} className="panel">
              <h2>{theme}</h2>
              {!list.length && <p className="muted small">Aucun lien.</p>}
              <ul className="link-list">
                {list.map((l) => (
                  <li key={l.id}>
                    {edit ? (
                      <LinkEditor link={l} themes={themes} onSave={(b) => run(() => linksApi.update(l.id, b))} onDelete={() => run(() => linksApi.remove(l.id))} onMove={(d) => move(l, d)} />
                    ) : (
                      <a {...open(l.url)} className="link-item" title={l.url}>
                        {l.label} <span className="muted">↗</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {toCheck.length > 0 && (
        <section className="panel" data-tuto="outils-liens-verifier">
          <h2>À vérifier</h2>
          <p className="small muted">
            Inara bloque les accès automatisés : ces adresses n'ont pas pu être contrôlées. Ouvre-les ; si la page est
            la bonne, clique sur « Ça marche » et elle rejoint le menu. Sinon, corrige l'adresse ou supprime-la.
          </p>
          <ul className="link-list">
            {toCheck.map((l) => (
              <li key={l.id} className="check-row">
                <span className="pill pill-warn">{l.theme}</span>
                <a {...open(l.url)}>{l.label} ↗</a>
                <code className="small muted">{l.url}</code>
                <span className="form-actions">
                  <button className="btn btn-primary small" onClick={() => run(() => linksApi.update(l.id, { verified: true }))}>✓ Ça marche</button>
                  <button className="btn small" onClick={() => {
                    const url = window.prompt('Adresse correcte :', l.url);
                    if (url) run(() => linksApi.update(l.id, { url, verified: true }));
                  }}>Corriger</button>
                  <button className="btn btn-ghost bad small" onClick={() => run(() => linksApi.remove(l.id))}>Supprimer</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {edit && (
        <>
          <AddLink themes={themes} onAdd={(b) => run(() => linksApi.create(b))} />
          <section className="panel" data-tuto="outils-liens-contextuels">
            <h2>Liens contextuels</h2>
            <p className="small muted">
              Modèles remplis avec ta position, et utilisés aussi dans les autres modules (stations d'une route,
              base d'un ingénieur). Variables : {'{system}'}, {'{station}'}, {'{marketId}'}, {'{systemAddress}'}.
            </p>
            <ul className="link-list">
              {templates.map((l) => (
                <li key={l.id}>
                  <LinkEditor link={l} themes={[l.theme]} onSave={(b) => run(() => linksApi.update(l.id, b))} onDelete={() => run(() => linksApi.remove(l.id))} onMove={(d) => move(l, d)} />
                </li>
              ))}
            </ul>
          </section>
          <p className="small">
            <button className="btn btn-ghost small" data-tuto="outils-liens-remettre" onClick={() => run(() => linksApi.restore())}>Remettre les liens proposés supprimés</button>
          </p>
        </>
      )}
    </div>
  );
}

function LinkEditor({ link, themes, onSave, onDelete, onMove }) {
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [theme, setTheme] = useState(link.theme);
  const dirty = label !== link.label || url !== link.url || theme !== link.theme;
  return (
    <div className="link-editor">
      <span className="move-btns">
        <button type="button" className="btn btn-ghost small" onClick={() => onMove(-1)} aria-label="Monter">▲</button>
        <button type="button" className="btn btn-ghost small" onClick={() => onMove(1)} aria-label="Descendre">▼</button>
      </span>
      <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Nom" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Adresse" className="link-url" spellCheck={false} />
      {themes.length > 1 && (
        <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Thème">
          {themes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
      {dirty && <button type="button" className="btn btn-primary small" onClick={() => onSave({ label, url, theme })}>Enregistrer</button>}
      <button type="button" className="btn btn-ghost bad small" onClick={onDelete} aria-label="Supprimer">✕</button>
      {link.source && <span className="small muted link-source" title={link.source}>source : {link.source}</span>}
    </div>
  );
}

function AddLink({ themes, onAdd }) {
  const [form, setForm] = useState({ label: '', url: 'https://', theme: themes[0] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="panel form-actions" data-tuto="outils-liens-ajouter"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(form);
        setForm({ ...form, label: '', url: 'https://' });
      }}
    >
      <strong>Ajouter un lien</strong>
      <input placeholder="Nom (ex. Ardent Insight)" value={form.label} onChange={set('label')} />
      <input placeholder="https://…" value={form.url} onChange={set('url')} className="link-url" spellCheck={false} />
      <select value={form.theme} onChange={set('theme')}>
        {themes.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <button className="btn btn-primary">Ajouter</button>
    </form>
  );
}
