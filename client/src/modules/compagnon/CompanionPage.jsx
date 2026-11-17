import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { int } from '../../core/format.js';
import { texteOverlayAbsent } from '../../core/installation.js';
import CompanionView from './CompanionView.jsx';
import { base, useCompanion } from './useCompanion.js';

const MOODS = ['neutre', 'content', 'ravi', 'inquiet', 'triste', 'malicieux', 'surpris', 'endormi'];
const KINDS = {
  alerte: { label: 'alerte', title: 'Parle aussi pendant un combat', className: 'pill-bad' },
  critique: { label: 'alerte', title: 'Parle aussi pendant un combat, même juste après une autre alerte', className: 'pill-bad' },
  important: { label: 'toujours', title: 'Ne dépend ni du bavardage ni du hasard (mais se tait en combat)', className: 'pill-info' },
};
const CASES = {
  matin: 'matin', aprem: 'après-midi', soir: 'soir', nuit: 'nuit', retour: 'longue absence', gros: 'gros', soumis: 'soumission',
  gratuit: 'gratuit', rachat: 'rachat payé', vaisseau: 'en vaisseau', pied: 'à pied', powerplay: 'Powerplay', invite: 'invitation', debloque: 'déblocage', grade5: 'grade 5',
  distance: 'trop loin', toolarge: 'trop grand', offences: 'infractions', nospace: 'complet', hostile: 'hostile',
  restrictedaccess: 'accès réservé', activefighter: 'chasseur dehors', dockoffline: 'hors service', jumpimminent: 'saut imminent',
};
const LEVEL_HINTS = {
  discret: 'quelques mots de temps en temps',
  normal: 'une réaction par moment fort',
  bavard: 'réagit presque à tout',
};
const MOOD_HINTS = {
  neutre: 'calme, petit sourire',
  content: 'sourire, yeux plissés',
  ravi: 'très heureux, bouche ouverte, étoiles',
  inquiet: 'sourcils relevés, goutte de sueur',
  triste: 'yeux baissés, larme',
  malicieux: 'clin d’œil, sourire en coin',
  surpris: 'yeux ronds, bouche en O',
  endormi: 'yeux fermés, « Zzz »',
};

const PROMPT = `Personnage de compagnon pour un jeu vidéo spatial : [décris ton personnage : qui il est, sa tenue, ses couleurs].
Style [cartoon / anime / pixel art / réaliste], vu de face, en buste, centré, image carrée 512 × 512, fond transparent (ou fond uni d'une seule couleur).
Garde exactement le même personnage, la même tenue, le même cadrage, la même taille et la même lumière sur toutes les images : seule l'expression du visage change.
Fais 9 images :
1. neutre : calme, petit sourire
2. content : sourire, yeux plissés
3. ravi : très heureux, bouche grande ouverte, petites étoiles autour
4. inquiet : sourcils relevés, goutte de sueur
5. triste : yeux baissés, une larme
6. malicieux : clin d'œil, sourire en coin
7. surpris : yeux grands ouverts, bouche en O
8. endormi : yeux fermés, « Zzz »
9. clignement : exactement l'image neutre, mais les yeux fermés`;

const PACK_JSON = `{
  "nom": "Nova",
  "auteur": "Ton pseudo",
  "humeurs": { "neutre": "nova-calme.png", "ravi": "nova-yeah.gif" },
  "phrases": {
    "vente": [ { "texte": "Ka-ching ! {profit} pour nous !", "humeur": "ravi" } ],
    "bonjour": [ { "texte": "Debout, {cmdr} ! Le café est servi.", "humeur": "content", "cas": "matin" } ]
  },
  "remplacerPhrases": false
}`;

// Mise en page propre à la page (le reste vient des styles communs : panel, btn, pill…)
const CSS = `
.cpg-top { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.1rem; align-items: start; margin-bottom: 1.1rem; }
@media (max-width: 900px) { .cpg-top { grid-template-columns: 1fr; } }
.cpg-stage { display: flex; flex-direction: column; gap: .8rem; }
.cpg-moods { display: flex; flex-wrap: wrap; gap: .35rem; }
.cpg-chip { font: inherit; font-size: .8rem; padding: .2rem .6rem; border-radius: 999px; border: 1px solid var(--border-strong);
  background: var(--panel-2); color: var(--muted); cursor: pointer; }
.cpg-chip:hover { border-color: var(--accent); color: var(--text); }
.cpg-chip.is-on { background: var(--accent-soft); border-color: var(--accent); color: var(--text-strong); }
.cpg-levels { display: flex; flex-wrap: wrap; gap: .5rem 1rem; }
.cpg-levels label { flex-direction: row; align-items: center; gap: .35rem; font-weight: 400; }
.cpg-row { display: flex; flex-wrap: wrap; gap: .8rem; }
.cpg-row label { flex: 1 1 12rem; }
.cpg-section { margin-bottom: 1.1rem; }
.cpg-packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: .8rem; margin-bottom: .8rem; }
.cpg-pack { display: grid; grid-template-columns: 72px 1fr auto; gap: .75rem; align-items: start; padding: .7rem;
  border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); }
.cpg-pack.is-on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.cpg-pack img, .cpg-noimg { width: 72px; height: 72px; object-fit: contain; border-radius: 6px; background: #0d1116; }
.cpg-noimg { display: grid; place-items: center; color: var(--muted); font-size: 1.4rem; }
.cpg-pack ul { margin: .3rem 0 0; padding-left: 1.1rem; }
.cpg-cats { display: flex; flex-direction: column; }
.cpg-cat { display: grid; grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr) auto; gap: .3rem .8rem; align-items: center;
  padding: .55rem 0; border-top: 1px solid var(--border); }
.cpg-cat.is-off > :not(.cpg-head) { opacity: .5; }
.cpg-head { display: flex; align-items: center; gap: .45rem; }
.cpg-cat .pill { font-size: .7rem; }
.cpg-actions { display: flex; gap: .4rem; align-items: center; justify-content: flex-end; }
.cpg-phrases { grid-column: 1 / -1; margin: .2rem 0 .2rem; padding: .6rem .8rem; list-style: none; border-radius: 6px;
  background: var(--bg); display: flex; flex-direction: column; gap: .3rem; }
.cpg-tag { display: inline-block; min-width: 5.2rem; margin-right: .5rem; font-size: .75rem; color: var(--accent); }
.cpg-case { display: inline-block; margin-right: .5rem; font-size: .7rem; padding: 0 .4rem; border-radius: 4px; background: var(--info-soft); color: var(--info); }
.cpg-guide h3 { margin-top: 1rem; }
.cpg-guide pre { margin: .4rem 0; padding: .7rem .9rem; border-radius: 6px; background: var(--bg); border: 1px solid var(--border);
  overflow-x: auto; white-space: pre-wrap; font-size: .82rem; line-height: 1.45; }
.cpg-guide table { border-collapse: collapse; margin: .4rem 0; }
.cpg-guide td, .cpg-guide th { padding: .25rem .9rem .25rem 0; text-align: left; vertical-align: top; }
.cpg-guide th { color: var(--muted); font-weight: 500; font-size: .85rem; }
.cpg-path { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.cpg-path code { padding: .2rem .45rem; border-radius: 5px; background: var(--bg); border: 1px solid var(--border); overflow-wrap: anywhere; }
`;

/** Réglages égaux ? (catégories : seules les coupées comptent) */
function same(a, b) {
  if (!a || !b) return false;
  const off = (s) => Object.keys(s.categories || {}).filter((k) => s.categories[k] === false).sort().join(',');
  return ['enabled', 'name', 'pack', 'level', 'minProfit', 'bigProfit', 'overlay', 'inApp', 'side'].every((k) => a[k] === b[k]) && off(a) === off(b);
}

function CopyButton({ text, label = 'Copier' }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => {
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }).catch(() => {});
  return <button type="button" className="btn small" onClick={copy}>{done ? 'Copié ✓' : label}</button>;
}

/**
 * Page du compagnon : aperçu, réglages (nom, bavardage, fenêtres, seuils), choix de l'avatar, réactions une à une
 * avec leurs phrases et un bouton « Essayer », et le guide pour faire son propre avatar.
 */
export default function CompanionPage() {
  const { state, line, show } = useCompanion();
  const [draft, setDraft] = useState(null);
  const [packs, setPacks] = useState(null);
  const [meta, setMeta] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [forced, setForced] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state && !draft) setDraft(state.settings);
  }, [state]);
  const loadPacks = () => api(`${base}/packs`).then(setPacks).catch((e) => setError(e.message));
  useEffect(() => {
    loadPacks();
    api('/overlay').then(setOverlay).catch(() => {});
  }, []);
  useEffect(() => {
    if (!draft?.pack) return;
    api(`${base}/categories?pack=${encodeURIComponent(draft.pack)}`).then(setMeta).catch((e) => setError(e.message));
  }, [draft?.pack]);

  if (!state || !draft) return <p className="muted">{error || 'Chargement…'}</p>;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setCategory = (id, on) => setDraft((d) => {
    const categories = { ...d.categories };
    if (on) delete categories[id];
    else categories[id] = false;
    return { ...d, categories };
  });
  const setAll = (on) => setDraft((d) => ({ ...d, categories: on ? {} : Object.fromEntries((meta?.categories || []).map((c) => [c.id, false])) }));
  const dirty = !same(draft, state.settings);
  const previewPack = packs?.packs.find((p) => p.id === draft.pack) || state.pack;
  const shownMood = forced || line?.mood || state.baseMood || 'neutre';

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Toutes les catégories, actives ou non : une catégorie réactivée doit le dire au serveur
      const categories = Object.fromEntries((meta?.categories || []).map((c) => [c.id, draft.categories[c.id] !== false]));
      const body = { ...draft, categories };
      if (draft.pack === state.settings.pack) delete body.pack; // pack inchangé : pas revérifié
      const saved = await api(`${base}/settings`, { method: 'PUT', body });
      setDraft(saved.settings);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function tryCategory(id) {
    setError('');
    setForced(null);
    try {
      show(await api(`${base}/try`, { method: 'POST', body: { category: id, name: draft.name, pack: draft.pack } }));
    } catch (e) {
      setError(e.message);
    }
  }

  const toggleOpen = (id) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="page">
      <style>{CSS}</style>
      <header className="route-header">
        <div>
          <h1>Compagnon</h1>
          <p className="muted">
            Un petit copilote qui réagit à ce que tu fais en jeu. Pas d’IA : des phrases écrites à l’avance, plusieurs
            pour chaque situation, tirées au hasard sans répétition. Rien ne sort de ton PC.
          </p>
        </div>
        <div className="form-actions" data-tuto="outils-compagnon-active">
          <label className="check"><input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Activé</label>
          {dirty && (
            <>
              <button className="btn btn-primary" onClick={save} disabled={saving}>Enregistrer</button>
              <button className="btn btn-ghost" onClick={() => setDraft(state.settings)}>Annuler</button>
            </>
          )}
        </div>
      </header>
      {error && <p className="bad">{error}</p>}

      <div className="cpg-top">
        <section className="panel cpg-stage" data-tuto="outils-compagnon-apercu">
          <h2>Aperçu</h2>
          <CompanionView
            variant="preview"
            pack={previewPack}
            mood={shownMood}
            line={line}
            name={draft.name}
            side={draft.side}
            placeholder={`Salut ! Moi, c’est ${draft.name}. Clique sur « Essayer » à côté d’une réaction pour m’entendre.`}
          />
          <div className="cpg-moods" aria-label="Humeurs">
            {MOODS.map((m) => (
              <button key={m} type="button" className={`cpg-chip ${shownMood === m ? 'is-on' : ''}`} onClick={() => setForced(forced === m ? null : m)}>
                {meta?.moods?.[m] || m}
              </button>
            ))}
          </div>
          <p className="small muted">
            Aperçu : rien n’est enregistré tant que tu n’as pas cliqué sur « Enregistrer ». « Essayer » le fait aussi parler
            dans la fenêtre en jeu, si elle est ouverte.
          </p>
        </section>

        <section className="panel form">
          <h2>Réglages</h2>
          <label>
            Nom du personnage
            <input value={draft.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div data-tuto="outils-compagnon-bavardage">
            <div className="small muted">Bavardage</div>
            <div className="cpg-levels">
              {Object.entries(meta?.levels || { discret: 'Discret', normal: 'Normal', bavard: 'Bavard' }).map(([id, label]) => (
                <label key={id} title={LEVEL_HINTS[id]}>
                  <input type="radio" name="cpg-level" checked={draft.level === id} onChange={() => set({ level: id })} /> {label}
                  <span className="small muted">({LEVEL_HINTS[id]})</span>
                </label>
              ))}
            </div>
          </div>
          <label className="check" data-tuto="outils-compagnon-fenetre">
            <input type="checkbox" checked={draft.overlay} onChange={(e) => set({ overlay: e.target.checked })} />
            Fenêtre par-dessus le jeu
          </label>
          <p className="small muted" style={{ margin: '-0.5rem 0 0' }}>
            {overlay && !overlay.installed
              ? texteOverlayAbsent({ coupe: overlay.disabled })
              : 'Elle s’ouvre quand le jeu tourne (tout de suite à l’activation, pour la placer) et se ferme peu après le jeu. ✥ pour la déplacer et la redimensionner, 📌 pour la fixer.'}
          </p>
          <label className="check">
            <input type="checkbox" checked={draft.inApp} onChange={(e) => set({ inApp: e.target.checked })} />
            Petit compagnon dans l’application (en bas à droite)
          </label>
          <div>
            <div className="small muted">Avatar</div>
            <div className="cpg-levels">
              <label><input type="radio" name="cpg-side" checked={draft.side === 'left'} onChange={() => set({ side: 'left' })} /> à gauche de la bulle</label>
              <label><input type="radio" name="cpg-side" checked={draft.side === 'right'} onChange={() => set({ side: 'right' })} /> à droite</label>
            </div>
          </div>
          <div className="cpg-row" data-tuto="outils-compagnon-seuils">
            <label>
              Bonne vente à partir de
              <input type="number" min="0" step="100000" value={draft.minProfit} onChange={(e) => set({ minProfit: Number(e.target.value) })} />
              <span className="small muted">{int(draft.minProfit)} cr de bénéfice</span>
            </label>
            <label>
              Très grosse vente à partir de
              <input type="number" min="0" step="1000000" value={draft.bigProfit} onChange={(e) => set({ bigProfit: Number(e.target.value) })} />
              <span className="small muted">{int(draft.bigProfit)} cr de bénéfice</span>
            </label>
          </div>
        </section>
      </div>

      <section className="panel cpg-section" data-tuto="outils-compagnon-avatar">
        <h2>Avatar</h2>
        {!packs && <p className="muted">Chargement…</p>}
        {packs && (
          <div className="cpg-packs">
            {packs.packs.map((p) => (
              <div key={p.id} className={`cpg-pack ${draft.pack === p.id ? 'is-on' : ''}`}>
                {p.moods.neutre ? <img src={p.moods.neutre} alt="" /> : <div className="cpg-noimg">?</div>}
                <div>
                  <b>{p.name}</b>
                  {p.author && <span className="small muted"> · {p.author}</span>}
                  <div className="small muted">
                    {p.builtin ? 'fourni avec l’app' : `dossier « ${p.id} »`} · {p.own.length}/8 humeurs{p.blink ? ' + clignement' : ''}
                    {p.phraseCount > 0 && ` · ${p.phraseCount} phrases${p.replacePhrases ? ' (à la place des miennes)' : ''}`}
                  </div>
                  {p.ok && p.missing.length > 0 && <div className="small warn">Remplacées par neutre : {p.missing.join(', ')}</div>}
                  {p.errors.length > 0 && (
                    <ul className="small bad">
                      {p.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
                      {p.errors.length > 6 && <li>… et {p.errors.length - 6} autres</li>}
                    </ul>
                  )}
                </div>
                <button type="button" className={`btn small ${draft.pack === p.id ? 'btn-primary' : ''}`} disabled={!p.ok} onClick={() => set({ pack: p.id })}>
                  {draft.pack === p.id ? 'Choisi' : 'Choisir'}
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn small" onClick={loadPacks}>↻ Recharger la liste</button>
        <span className="small muted"> après avoir ajouté ou modifié un pack (voir « Fais ton propre avatar », plus bas).</span>
      </section>

      <section className="panel cpg-section" data-tuto="outils-compagnon-reactions">
        <h2>Réactions</h2>
        <p className="small muted">
          Coche ce qui doit le faire parler. Pendant un combat, seules les alertes parlent. Chaque réaction a un délai
          minimal, et le bavardage règle le délai entre deux phrases.
        </p>
        <div className="form-actions" style={{ marginBottom: '.5rem' }}>
          <button type="button" className="btn small" onClick={() => setAll(true)}>Tout activer</button>
          <button type="button" className="btn btn-ghost small" onClick={() => setAll(false)}>Tout couper</button>
        </div>
        <div className="cpg-cats">
          {(meta?.categories || []).map((c) => {
            const on = draft.categories[c.id] !== false;
            const kind = KINDS[c.kind];
            return (
              <div key={c.id} className={`cpg-cat ${on ? '' : 'is-off'}`}>
                <label className="check cpg-head">
                  <input type="checkbox" checked={on} onChange={(e) => setCategory(c.id, e.target.checked)} />
                  <b>{c.label}</b>
                  {kind && <span className={`pill ${kind.className}`} title={kind.title}>{kind.label}</span>}
                </label>
                <span className="small muted">{c.when}</span>
                <span className="cpg-actions">
                  <button type="button" className="btn small" onClick={() => tryCategory(c.id)}>▶ Essayer</button>
                  <button type="button" className="btn btn-ghost small" onClick={() => toggleOpen(c.id)}>
                    {open.has(c.id) ? 'Masquer' : `${c.phrases.length} phrases`}
                  </button>
                </span>
                {open.has(c.id) && (
                  <ul className="cpg-phrases">
                    {c.phrases.map((p, i) => (
                      <li key={i}>
                        <span className="cpg-tag">{meta.moods[p.humeur] || p.humeur}</span>
                        {p.cas && <span className="cpg-case">{CASES[p.cas] || p.cas}</span>}
                        {p.texte}
                      </li>
                    ))}
                    <li className="small muted">
                      Variables : {c.vars.map((v) => `{${v}}`).join(' ')}
                      {c.cases.length > 0 && ` · cas : ${c.cases.map((k) => `${k} (${CASES[k] || k})`).join(', ')}`}
                    </li>
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel cpg-section cpg-guide" data-tuto="outils-compagnon-guide">
        <h2>Fais ton propre avatar</h2>
        <p>
          Tu peux remplacer le Copilote par ton propre personnage : dessiné, généré par un outil d’images, ta photo…
          Il suffit d’un dossier avec une image par humeur.
        </p>

        <h3>1. Le dossier</h3>
        <div className="cpg-path">
          <code>{packs?.dir || '…\\server\\data\\compagnon\\avatars'}\&lt;nom-du-pack&gt;\</code>
          {packs?.dir && <CopyButton text={packs.dir} label="Copier le chemin" />}
        </div>
        <p className="small muted">Nom du dossier : lettres, chiffres, tirets et « _ » (par exemple « nova » ou « mon-pilote »).</p>

        <h3>2. Les images</h3>
        <table>
          <thead><tr><th>Fichier</th><th>Humeur</th><th>Expression</th></tr></thead>
          <tbody>
            {MOODS.map((m) => (
              <tr key={m}><td><code>{m}.png</code></td><td>{meta?.moods?.[m] || m}</td><td className="muted">{MOOD_HINTS[m]}</td></tr>
            ))}
            <tr><td><code>clignement.png</code></td><td>facultatif</td><td className="muted">l’image neutre, yeux fermés : il cligne des yeux de temps en temps</td></tr>
          </tbody>
        </table>
        <ul>
          <li>Image carrée, <b>512 × 512</b> conseillé, <b>fond transparent</b>, personnage centré en buste.</li>
          <li><b>Même cadrage et même taille</b> sur toutes les images : sinon il « saute » quand il change d’humeur.</li>
          <li>Formats : <b>PNG, WebP ou GIF</b>. Les GIF et les PNG animés (APNG) sont acceptés tels quels. <b>4 Mo</b> et <b>2 048 × 2 048 px</b> au plus par image. Pas de SVG.</li>
          <li>Une humeur manquante est remplacée par l’image neutre : seule <code>neutre.png</code> est obligatoire.</li>
          <li>Ensuite : « ↻ Recharger la liste », « Choisir » sous ton pack, puis « Enregistrer ». Les erreurs s’affichent sous sa carte.</li>
        </ul>

        <h3>3. Avec un générateur d’images</h3>
        <p className="small">
          Fais d’abord l’image neutre. Puis demande les autres <i>à partir de celle-ci</i> : « même personnage, même
          cadrage, seule l’expression change ». Si l’outil ne sait pas faire de fond transparent, demande un fond uni et
          détoure ensuite (outil de suppression d’arrière-plan). Modèle de consigne, à compléter :
        </p>
        <pre>{PROMPT}</pre>
        <CopyButton text={PROMPT} label="Copier la consigne" />

        <h3>4. Facultatif : pack.json</h3>
        <p className="small">
          Pour donner un nom au pack, utiliser d’autres noms de fichiers, ou ajouter tes propres phrases. Texte seul
          (220 caractères au plus, 40 phrases par réaction), une humeur parmi les 8, et les variables de la réaction
          (bouton « phrases » ci-dessus). Avec <code>"remplacerPhrases": true</code>, tes phrases remplacent les miennes dans
          les réactions que tu remplis.
        </p>
        <pre>{PACK_JSON}</pre>
        <CopyButton text={PACK_JSON} label="Copier l’exemple" />
      </section>
    </div>
  );
}
