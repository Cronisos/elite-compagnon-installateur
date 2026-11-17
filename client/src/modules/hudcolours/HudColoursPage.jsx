import { useEffect, useMemo, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import FakeHud from './FakeHud.jsx';
import {
  autoSecondaryHue, BLEU_INVERSE, buildMatrix, closeTints, hex, hsvToRgb, IDENTITY, LIMIT, ORANGE, ORANGE_HUE, PALETTE, parseHex, PRESETS,
  presetMatrix, rgbToHsv, ROWS, sameMatrix, shown, snippet, SPACES, validMatrix,
} from './colour.js';
import './hudcolours.css';

const base = '/modules/hudcolours';
const hcApi = {
  state: () => api(`${base}/state`),
  apply: (body) => api(`${base}/apply`, { method: 'POST', body }),
  reset: (body) => api(`${base}/reset`, { method: 'POST', body }),
  restore: (body) => api(`${base}/restore`, { method: 'POST', body }),
};
const RUN_EVENTS = new Set(['Fileheader', 'LoadGame', 'Shutdown']);
const REFRESH_MS = 60_000;
const DEFAULT_PARAMS = { hue: ORANGE_HUE, sat: 1, val: 1, secondary: null };
const PREFIX = 'GraphicsConfigurationOverride.xml.';
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Calcul de l'aperçu choisi par le joueur (simple préférence d'affichage, gardée dans ce navigateur)
const SPACE_KEY = 'elite-compagnon.hudcolours.space';
function loadSpace() {
  try {
    const v = localStorage.getItem(SPACE_KEY);
    return SPACES.includes(v) ? v : 'srgb';
  } catch {
    return 'srgb';
  }
}
function saveSpace(v) {
  try {
    localStorage.setItem(SPACE_KEY, v);
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
}

function Swatch({ rgb, title, big }) {
  return <span className={`hc-swatch${big ? ' hc-swatch-big' : ''}`} style={{ background: hex(rgb) }} title={title || hex(rgb)} />;
}

/** Le jeu tourne-t-il ? Le changement ne se voit qu'au prochain démarrage du jeu. */
function GameStatus({ game }) {
  if (!game) return null;
  if (game.state === 'running') return <span className="pill pill-warn">Jeu ouvert : relance-le après avoir appliqué</span>;
  if (game.state === 'closed') return <span className="pill pill-good">Jeu fermé : la couleur sera là au prochain lancement</span>;
  return <span className="pill pill-muted" title="Pas de fermeture notée dans le journal, ou rien d'écrit depuis longtemps">État du jeu inconnu</span>;
}

/** Case du mode avancé : le texte saisi reste tel quel tant qu'on écrit (« - », « 0. »). */
function NumberCell({ value, onChange, label }) {
  const [text, setText] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(String(value));
  }, [value, focus]);
  return (
    <input
      type="number"
      className="hc-num"
      step="0.05"
      min={-LIMIT}
      max={LIMIT}
      value={text}
      aria-label={label}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v) && Math.abs(v) <= LIMIT) onChange(v);
      }}
    />
  );
}

/**
 * Page « Couleurs du HUD » : préréglages, teinte / saturation / luminosité, mode avancé (les 9 nombres),
 * aperçu avant / après sur un faux HUD, puis écriture dans GraphicsConfigurationOverride.xml (avec sauvegarde).
 */
/**
 * « L'app prend la couleur de mon HUD » : les oranges de toute l'app (fenêtres, MAR, pavé, fenêtres en jeu) passés par
 * la matrice du fichier du jeu (calcul du serveur, GET /teinte). Oui par défaut ; décoché, l'app garde son orange.
 */
function TeinteApp() {
  const [t, setT] = useState(null);
  const lire = () => api('/modules/hudcolours/teinte').then(setT).catch(() => {});
  useEffect(() => {
    lire();
  }, []);
  useEvent('hudcolours:update', lire);
  if (!t) return null;
  const regler = (suivre) => api('/modules/hudcolours/teinte', { method: 'PUT', body: { suivre } }).then(lire).catch(() => {});
  const a = t.couleurs.acc;
  return (
    <section className="panel" data-tuto="outils-hud-teinte">
      <h2>L’app à tes couleurs</h2>
      <label className="check">
        <input type="checkbox" checked={t.suivre} onChange={(e) => regler(e.target.checked)} /> L’app prend la couleur de mon HUD
      </label>
      <p className="muted small">
        Fenêtres, MAR, pavé et fenêtres en jeu prennent la couleur que le jeu donne à son orange avec ta matrice
        (celle du fichier, appliquée au prochain lancement du jeu).{' '}
        {t.identite ? 'Ta matrice est celle d’origine : l’app garde son orange.' : <>Couleur de l’app : <Swatch rgb={a.map((x) => x / 255)} title={`rgb(${a.join(', ')})`} /></>}
      </p>
    </section>
  );
}

export default function HudColoursPage() {
  const [file, setFile] = useState(null);
  const [loadError, setLoadError] = useState(''); // lecture de l'état : effacée à la prochaine lecture réussie
  const [error, setError] = useState(''); // action du joueur (écriture refusée…) : gardée jusqu'à sa prochaine action
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [manual, setManual] = useState(null); // matrice saisie à la main, préréglage fixe ou fichier actuel
  const [advanced, setAdvanced] = useState(false);
  const [compare, setCompare] = useState('current'); // avant = ton HUD actuel, ou l'orange d'origine
  const [split, setSplit] = useState(0.5);
  const [loaded, setLoaded] = useState(false);
  const [space, setSpaceState] = useState(loadSpace);
  const setSpace = (v) => {
    setSpaceState(v);
    saveSpace(v);
  };

  // Relecture de l'état : ne touche jamais au message d'une action (refus d'écriture…), que le joueur doit voir
  const refresh = () => hcApi.state().then(
    (s) => { setFile(s); setLoadError(''); return s; },
    (e) => { setLoadError(e.message); return null; },
  );
  useEffect(() => {
    refresh().then((s) => {
      // L'éditeur part de la couleur actuelle du jeu
      if (s?.matrix && !sameMatrix(s.matrix, IDENTITY)) setManual(s.matrix);
      setLoaded(true);
    });
  }, []);
  useEvent('hudcolours:update', () => refresh());
  useEvent('journal:event', (e) => RUN_EVENTS.has(e?.event) && refresh());
  // Relecture discrète chaque minute : état du jeu, fichier retouché à la main
  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const matrix = manual || buildMatrix(params, space);
  const current = file?.matrix || IDENTITY;
  const before = compare === 'current' ? current : IDENTITY;
  const target = shown(matrix, ORANGE, space);
  // Ligne illisible dans le fichier : file.matrix la remplace par celle d'origine, mais le fichier reste à réécrire
  const fileBroken = Object.values(file?.rows || {}).includes('invalid');
  const sameAsFile = sameMatrix(matrix, current);
  const unchanged = sameAsFile && !fileBroken;
  const activePreset = useMemo(() => PRESETS.find((p) => sameMatrix(presetMatrix(p, space), matrix))?.id || null, [matrix, space]);
  const close = closeTints(matrix, space);
  const canWrite = file && file.dirExists && !file.error && !file.readOnly;

  const setParam = (k, v) => {
    setManual(null); // bouger un curseur repart du réglage simple
    setParams((p) => ({ ...p, [k]: v }));
  };
  function choosePreset(p) {
    if (p.matrix) {
      setManual(p.matrix);
    } else {
      setManual(null);
      setParams(p.params);
    }
  }
  /** Retour à la couleur du fichier du jeu. */
  function revert() {
    if (file?.matrix && !sameMatrix(file.matrix, IDENTITY)) setManual(file.matrix);
    else {
      setManual(null);
      setParams(DEFAULT_PARAMS);
    }
  }
  function setCell(key, i, v) {
    const m = structuredClone(matrix);
    m[key][i] = v;
    setManual(m);
  }

  async function write(fn, okMessage) {
    setBusy(true);
    setError('');
    setFlash('');
    try {
      const { result, state } = await fn();
      setFile(state);
      if (!result.changed) setFlash('Rien à changer : le fichier avait déjà ces couleurs.');
      else {
        const relaunch = state.game?.state === 'running'
          ? 'Le jeu est ouvert : quitte-le complètement (jusqu’au bureau) et relance-le pour voir le changement.'
          : 'Relance le jeu pour voir le changement.';
        setFlash(`✓ ${okMessage}${result.backup ? ` Copie de l’ancien fichier : ${result.backup}.` : ''} ${relaunch}`);
      }
    } catch (e) {
      setError(e.message);
      refresh(); // le message reste affiché : le joueur doit savoir que rien n'a été écrit
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!validMatrix(matrix)) return setError(`Chaque nombre doit rester entre −${LIMIT} et ${LIMIT}.`);
    const ok = window.confirm(
      'Appliquer ces couleurs à Elite Dangerous ?\n\n'
      + 'L’app garde d’abord une copie de ton fichier actuel, puis ne change que le bloc des couleurs de GraphicsConfigurationOverride.xml.\n\n'
      + 'Relance le jeu pour voir le changement.',
    );
    if (ok) write(() => hcApi.apply({ matrix, version: file.version, confirm: true }), 'Couleurs enregistrées.');
  }
  function reset() {
    const ok = window.confirm('Revenir à l’orange d’origine ?\n\nL’app garde d’abord une copie de ton fichier actuel, puis retire le bloc des couleurs.\n\nRelance le jeu pour voir le changement.');
    if (ok) write(() => hcApi.reset({ version: file.version, confirm: true }), 'Retour à l’orange d’origine enregistré.');
  }
  function restore(b) {
    const whole = file.error || !file.exists;
    const ok = window.confirm(
      `Restaurer la sauvegarde « ${b.name.replace(PREFIX, '')} » ?\n\n`
      + (whole ? 'Ton fichier actuel est illisible ou absent : la sauvegarde le remplace en entier (une copie est gardée).' : 'Seules ses couleurs sont reprises ; le reste de ton fichier actuel ne change pas (une copie est gardée).')
      + '\n\nRelance le jeu pour voir le changement.',
    );
    if (ok) write(() => hcApi.restore({ name: b.name, version: file.version, confirm: true }), 'Sauvegarde restaurée.');
  }
  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet(matrix));
      setFlash('Bloc XML copié : il se colle dans GraphicsConfigurationOverride.xml, ou sur Discord pour partager ta couleur.');
    } catch {
      setError('Copie impossible dans le presse-papiers.');
    }
  }

  const hueBg = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => hex(hsvToRgb(h, 1, 1))).join(', ')})`;
  const satBg = `linear-gradient(to right, ${hex(hsvToRgb(params.hue, 0, params.val))}, ${hex(hsvToRgb(params.hue, 1, params.val))})`;
  const valBg = `linear-gradient(to right, #000, ${hex(hsvToRgb(params.hue, params.sat, 1))})`;
  const secondaryHue = params.secondary ?? autoSecondaryHue(params.hue);

  return (
    <div className="page hc-page">
      <header className="route-header">
        <div>
          <h1>Couleurs du HUD</h1>
          <p className="muted">Choisis la couleur de l’interface du jeu, regarde le résultat, puis applique-la. Le jeu la lit à son démarrage.</p>
        </div>
        <div className="form-actions"><GameStatus game={file?.game} /></div>
      </header>

      {error && <p className="bad">{error}</p>}
      {loadError && loadError !== error && <p className="bad">{loadError}</p>}
      {flash && <p className="good flash hc-msg">{flash}</p>}
      {file && !file.dirExists && <p className="warn">Dossier des options du jeu introuvable ({file.dir}) : lance le jeu une fois sur ce PC, puis reviens ici.</p>}
      {file?.error && <p className="warn">{file.error} Tu peux encore restaurer une sauvegarde (plus bas).</p>}
      {file?.readOnly && <p className="warn">Le fichier est en lecture seule : l’app ne peut pas l’écrire. Dans ses propriétés (clic droit, Propriétés), décoche « Lecture seule », puis recharge la page.</p>}
      {fileBroken && <p className="warn">Une ligne de la matrice du fichier n’a pas 3 nombres : l’aperçu la remplace par celle d’origine, « Appliquer » réécrit le bloc des couleurs en entier.</p>}

      <div className="hc-layout">
        <section className="panel hc-preview-panel">
          <FakeHud before={before} after={matrix} split={split} onSplit={setSplit} space={space} />
          <div className="hc-compare" data-tuto="outils-hud-apercu">
            <div className="hc-compare-buttons" role="group" aria-label="Vue">
              <button className={`btn${split === 1 ? ' btn-primary' : ''}`} onClick={() => setSplit(1)}>Avant</button>
              <button className={`btn${split > 0 && split < 1 ? ' btn-primary' : ''}`} onClick={() => setSplit(0.5)}>Avant / après</button>
              <button className={`btn${split === 0 ? ' btn-primary' : ''}`} onClick={() => setSplit(0)}>Après</button>
            </div>
            <input type="range" min="0" max="100" value={Math.round(split * 100)} onChange={(e) => setSplit(Number(e.target.value) / 100)} aria-label="Séparation avant / après" />
            <label className="check small">
              Avant =
              <select value={compare} onChange={(e) => setCompare(e.target.value)}>
                <option value="current">ton HUD actuel</option>
                <option value="origin">l’orange d’origine</option>
              </select>
            </label>
          </div>
          <p className="muted small">Glisse sur l’image pour comparer. Dessin de l’app (pas une capture du jeu) : seule l’interface change de couleur, pas l’espace ni le cockpit. Couleurs approchées : voir « Calcul de l’aperçu » ci-dessous.</p>

          <div className="hc-space">
            <label className="check small">
              Calcul de l’aperçu
              <select value={space} onChange={(e) => setSpace(e.target.value)}>
                <option value="srgb">valeurs telles quelles (sRGB)</option>
                <option value="linear">lumière linéaire (comme l’éditeur arkku)</option>
              </select>
            </label>
            <p className="muted small">
              Pas encore vérifié en jeu : une même matrice donne des teintes différentes selon le calcul. Pour trancher une
              fois pour toutes : restaure ta copie <code>.bleu.bak</code> (ou applique « Bleu inversé »), relance le jeu et
              regarde le HUD devenu bleu. Bleu soutenu <Swatch rgb={shown(BLEU_INVERSE, ORANGE, 'srgb')} /> : garde « valeurs
              telles quelles ». Bleu pâle <Swatch rgb={shown(BLEU_INVERSE, ORANGE, 'linear')} /> : choisis « lumière
              linéaire ». L’app retient ton choix ; les curseurs et préréglages en tiennent compte.
            </p>
          </div>

          <h3>Ce que deviennent les autres teintes</h3>
          <table className="table hc-tints">
            <thead><tr><th>Teinte du jeu</th><th>Avant</th><th>Après</th></tr></thead>
            <tbody>
              {PALETTE.map((p) => (
                <tr key={p.key}>
                  <td>{p.label} <span className="muted small">· {p.where}</span></td>
                  <td><Swatch rgb={shown(before, p.rgb, space)} /></td>
                  <td><Swatch rgb={shown(matrix, p.rgb, space)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel hc-controls">
          <h2>Préréglages</h2>
          <div className="hc-presets" data-tuto="outils-hud-prereglages">
            {PRESETS.map((p) => (
              <button key={p.id} className={`hc-preset${activePreset === p.id ? ' active' : ''}`} onClick={() => choosePreset(p)} title={p.note || p.label}>
                <Swatch rgb={shown(presetMatrix(p, space), ORANGE, space)} />
                <span>{p.label}{p.note && <span className="muted small"> · {p.note}</span>}</span>
              </button>
            ))}
          </div>

          <h2>Ta couleur</h2>
          {manual && <p className="muted small">Réglage {loaded && file?.matrix && sameMatrix(manual, file.matrix) ? 'actuel du jeu' : 'manuel'} : bouger un curseur repart du réglage simple.</p>}
          <div className={`hc-sliders${manual ? ' hc-dim' : ''}`} data-tuto="outils-hud-curseurs">
            <label>
              <span>Teinte <span className="muted num">{Math.round(params.hue)}°</span></span>
              <input type="range" className="hc-range" style={{ background: hueBg }} min="0" max="360" step="1" value={params.hue} onChange={(e) => setParam('hue', Number(e.target.value))} />
            </label>
            <label>
              <span>Saturation <span className="muted num">{Math.round(params.sat * 100)} %</span></span>
              <input type="range" className="hc-range" style={{ background: satBg }} min="0" max="100" value={Math.round(params.sat * 100)} onChange={(e) => setParam('sat', Number(e.target.value) / 100)} />
            </label>
            <label>
              <span>Luminosité <span className="muted num">{Math.round(params.val * 100)} %</span></span>
              <input type="range" className="hc-range" style={{ background: valBg }} min="25" max="100" value={Math.round(params.val * 100)} onChange={(e) => setParam('val', Number(e.target.value) / 100)} />
            </label>
            <label className="hc-exact">
              <span>Couleur exacte</span>
              <input
                type="color"
                value={hex(target)}
                onChange={(e) => {
                  const rgb = parseHex(e.target.value);
                  if (!rgb) return;
                  const hsv = rgbToHsv(rgb);
                  setManual(null);
                  setParams((p) => ({ ...p, hue: hsv.sat ? hsv.hue : p.hue, sat: hsv.sat, val: Math.max(0.25, hsv.val) }));
                }}
              />
            </label>
            <label>
              <span>Éléments bleus (boucliers…) <span className="muted num">{Math.round(secondaryHue)}°</span></span>
              <input type="range" className="hc-range" style={{ background: hueBg }} min="0" max="360" step="1" value={secondaryHue} onChange={(e) => setParam('secondary', Number(e.target.value))} />
            </label>
            <label className="check small">
              <input type="checkbox" checked={params.secondary == null} onChange={(e) => setParam('secondary', e.target.checked ? null : secondaryHue)} />
              Automatique : décalés comme l’orange (ils restent différents du reste du HUD)
            </label>
          </div>

          <div className="hc-result">
            <Swatch rgb={target} big title="Nouvelle couleur de l’orange du HUD" />
            <div>
              <div className="num">{hex(target).toUpperCase()}</div>
              <div className="muted small">nouvelle couleur de l’orange du HUD</div>
            </div>
          </div>

          <button className="btn btn-ghost hc-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
            {advanced ? '▾' : '▸'} Mode avancé : les 9 nombres
          </button>
          {advanced && (
            <div className="hc-advanced">
              <p className="muted small">
                Chaque ligne est une couleur d’origine du jeu ; ses trois nombres disent combien elle donne de rouge, de vert
                et de bleu à l’écran (de −{LIMIT} à {LIMIT}). L’orange du HUD est surtout du rouge avec un peu de vert :
                c’est la ligne MatrixRed qui compte le plus.
              </p>
              <table className="hc-matrix">
                <thead><tr><th /><th>→ rouge</th><th>→ vert</th><th>→ bleu</th></tr></thead>
                <tbody>
                  {ROWS.map(([key, tag, label]) => (
                    <tr key={key}>
                      <th><div>{label}</div><code className="muted small">{tag}</code></th>
                      {[0, 1, 2].map((i) => (
                        <td key={i}><NumberCell value={matrix[key][i]} label={`${tag} ${['rouge', 'vert', 'bleu'][i]}`} onChange={(v) => setCell(key, i, v)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {close.length > 0 && (
            <p className="warn small hc-close">
              Attention : {close.map((c) => c.text).join(' ; ')}. Compare-les dans l’aperçu et le tableau des teintes avant d’appliquer.
            </p>
          )}
          <div className="form-actions hc-actions" data-tuto="outils-hud-actions">
            <button className="btn btn-primary" data-tuto="outils-hud-appliquer" onClick={apply} disabled={busy || !canWrite || unchanged} title={unchanged ? 'C’est déjà la couleur du fichier' : ''}>
              Appliquer au jeu
            </button>
            <button className="btn" onClick={revert} disabled={busy || sameAsFile}>
              Annuler mes changements
            </button>
            <button className="btn" onClick={reset} disabled={busy || !canWrite || !file?.hasBlock}>Revenir à l’orange</button>
            <button className="btn btn-ghost" onClick={copySnippet}>Copier le bloc XML</button>
          </div>
          {unchanged && file && <p className="muted small">C’est déjà la couleur du fichier du jeu.</p>}
        </section>
      </div>

      <div className="two-cols">
        <section className="panel" data-tuto="outils-hud-sauvegardes">
          <h2>Sauvegardes</h2>
          <p className="muted small">
            Avant chaque changement, l’app garde une copie du fichier à côté de lui (les 10 dernières). Tes propres copies
            (fichiers .bak) sont listées aussi et ne sont jamais effacées.
          </p>
          {!file?.backups?.length ? <p className="muted">Aucune sauvegarde pour l’instant.</p> : (
            <ul className="hc-backups">
              {file.backups.map((b) => (
                <li key={b.name}>
                  <Swatch rgb={shown(b.matrix || IDENTITY, ORANGE, space)} title={b.matrix ? 'Couleur de l’orange dans cette sauvegarde' : 'Orange d’origine'} />
                  <div className="hc-backup-name">
                    <div>{b.own ? dateTime(b.at) : b.name.replace(PREFIX, '')}</div>
                    <div className="muted small">{b.own ? 'copie de l’app' : `ta copie · ${dateTime(b.at)}`}{b.error ? ` · ${b.error}` : ''}</div>
                  </div>
                  <button className="btn btn-ghost" disabled={Boolean(b.error)} onClick={() => setManual(b.matrix || IDENTITY)} title="Voir ces couleurs dans l’aperçu">Aperçu</button>
                  <button className="btn" disabled={busy || Boolean(b.error) || !file.dirExists || file.readOnly} onClick={() => restore(b)}>Restaurer</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <TeinteApp />

        <section className="panel" data-tuto="outils-hud-savoir">
          <h2>À savoir</h2>
          <ul className="notes hc-notes">
            <li><strong>Relance le jeu</strong> : il ne lit ce fichier qu’à son démarrage. Quitte-le jusqu’au bureau, puis relance-le.</li>
            <li>La matrice ne change pas une seule couleur : elle transforme <strong>toutes les couleurs de l’interface</strong> à la fois. Le bleu des boucliers, le rouge des alertes, le vert des alliés et les menus changent aussi : regarde-les dans l’aperçu et le tableau des teintes.</li>
            <li><strong>Certains éléments ne suivent pas la matrice</strong> (éclairage du cockpit, images et vidéos, certains écrans ou icônes selon la version du jeu) : l’aperçu ne peut pas tout montrer.</li>
            <li><strong>L’aperçu est approché</strong> : teintes de départ proches de celles du jeu, pas identiques, et calcul du jeu pas encore vérifié (voir « Calcul de l’aperçu »). Le résultat en jeu peut différer.</li>
            <li>Ce fichier est dans ton dossier d’options, pas dans celui du jeu : les mises à jour du jeu ne l’effacent pas. Un mod comme EDHM peut passer par-dessus ces couleurs.</li>
            <li>« Revenir à l’orange » retire le bloc des couleurs : le jeu reprend alors celles de son fichier principal (l’orange, sauf si tu as modifié GraphicsConfiguration.xml dans le dossier du jeu).</li>
          </ul>
          {file && (
            <p className="muted small hc-path">
              Fichier : <code>{file.path}</code>
              {file.exists ? ` · modifié le ${dateTime(file.modifiedAt)}` : ' · absent (il sera créé)'}
              {file.otherSettings && ' · contient d’autres réglages, gardés tels quels'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
