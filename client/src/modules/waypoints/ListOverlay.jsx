import { useEffect, useRef, useState } from 'react';
import { PanelOverlay, useHiddenWindow } from '../../core/hud.jsx';
import { useEvent } from '../../core/stream.js';
import { meters, wpApi } from './api.js';
import { tabOf } from './tabs.js';
import { shortPlace } from './places.js';
import { useSurvey, VERDICTS } from './Survey.jsx';
import { caches, cleContexte, eeps, planetes, reperesDe, systemes, visibles, vueAuto } from './navReperes.js';

// Fenêtre « Repères » de l'overlay (/hud/waypoints-list), ouverte cachée avec le mode Minage Rhino ; le bouton 📍 du
// HUD la montre. On y navigue à la souris (mode souris : Alt+Maj+K) : systèmes → planètes où tu as des repères → EEP
// → repères, avec 🧭 pour le guidage. Elle suit d'elle-même où tu es (ton système, la planète près de laquelle tu es,
// l'EEP ciblé en jeu) ; un clic va ailleurs, jusqu'à ce que tu changes de planète ou d'EEP ciblé, ou « ◎ Suivre ».
// « ⏳ Taris » montre aussi les repères taris et pas rentables (cachés sinon). Logique : navReperes.js.
const CSS = `
.rl { font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; display: flex; flex-direction: column; gap: 8px; }
.rl-bar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.rl-crumb { padding: 2px 7px; border: 1px solid rgba(var(--acc-rgb),.45); border-radius: 3px; background: #07090c; color: var(--accent);
  font-size: 13px; font-weight: 600; cursor: pointer; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-crumb:hover { background: var(--accent); color: #07090c; }
.rl-crumb.is-here { border-color: var(--accent); background: rgba(var(--acc-rgb),.16); color: #f4f6f8; cursor: default; }
.rl-sep { color: #8a94a0; font-size: 12px; }
.rl-tools { margin-left: auto; display: flex; gap: 4px; }
.rl-tool { padding: 2px 7px; border: 1px solid #3a4250; border-radius: 3px; background: #07090c; color: #c9d1db; font-size: 12px; cursor: pointer; }
.rl-tool:hover, .rl-tool.is-on { border-color: var(--accent); color: var(--accent); }
.rl-sec { display: flex; flex-direction: column; gap: 4px; }
.rl-sec-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #8a94a0; }
.rl-nav { display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 6px 10px; border: 0; border-left: 3px solid transparent;
  border-radius: 3px; background: rgba(255,255,255,.045); color: #dfe4ea; font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.rl-nav:hover { background: rgba(var(--acc-rgb),.16); border-left-color: var(--accent); }
.rl-nav.is-here { border-left-color: var(--accent); }
.rl-nav b { flex: none; min-width: 44px; font-size: 16px; color: #f4f6f8; }
.rl-nav .rl-what { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-nav .rl-n { flex: none; color: #8a94a0; font-size: 13px; }
.rl-nav .rl-chev { flex: none; color: var(--accent); font-weight: 700; }
.rl-v { flex: none; width: 16px; font-weight: 700; text-align: center; }
.rl-v.is-good { color: #5fd38d; } .rl-v.is-depleted, .rl-v.is-low { color: #f5a524; } .rl-v.is-bad, .rl-v.is-out { color: #ff6b6b; } .rl-v.is-unknown { color: #8a94a0; }
.rl-eep { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 6px 10px; border-left: 3px solid var(--accent);
  background: rgba(var(--acc-rgb),.08); }
.rl-eep-num { font-size: 20px; font-weight: 700; color: var(--accent); }
.rl-rate { font-size: 15px; font-weight: 700; }
.rl-rate.is-good { color: #5fd38d; }
.rl-rate.is-low { color: #f5a524; }
.rl-rate.is-none { color: #8a94a0; font-size: 13px; font-weight: 400; }
.rl-ores { width: 100%; font-size: 14px; color: #f4f6f8; }
.rl-row { display: flex; align-items: center; gap: 10px; padding: 5px 4px 5px 10px; border-radius: 3px; background: rgba(255,255,255,.035); }
.rl-row.is-guided { background: rgba(var(--acc-rgb),.16); }
.rl-row.is-old { opacity: .6; }
.rl-tag { flex: none; font-size: 12px; font-weight: 700; color: var(--accent); }
.rl-tag.is-old { color: #f5a524; }
.rl-label { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; color: #f4f6f8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-drills { flex: none; font-size: 12px; color: #8a94a0; }
.rl-dist { flex: none; font-size: 15px; font-weight: 700; color: #f4f6f8; font-variant-numeric: tabular-nums; }
.rl-go { flex: none; width: 30px; height: 26px; padding: 0; border: 1px solid var(--accent); border-radius: 4px; background: #07090c;
  color: var(--accent); font-size: 15px; cursor: pointer; }
.rl-go:hover, .rl-go.is-on { background: var(--accent); color: #07090c; }
.rl-empty { font-size: 13px; color: #8a94a0; margin: 2px 0; }
.rl-good { color: #5fd38d; }
.rl-dim { color: #8a94a0; font-size: 13px; }
`;

const rad = (d) => (d * Math.PI) / 180;
const meme = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Distance au sol (m) entre ta position et un repère de la même planète (haversine), ou null. */
function distanceTo(here, w) {
  if (!w || here?.latitude == null || w.latitude == null || !here.planetRadius || here.body !== w.body) return null;
  const a = Math.sin(rad(w.latitude - here.latitude) / 2) ** 2
    + Math.cos(rad(here.latitude)) * Math.cos(rad(w.latitude)) * Math.sin(rad(w.longitude - here.longitude) / 2) ** 2;
  return 2 * here.planetRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Note d'un EEP prospecté : « 7/10 », « rien d'intéressant », « pas noté ». */
function Note({ site }) {
  if (site?.bad) return <span className="rl-rate is-low">rien d’intéressant</span>;
  if (site?.rating != null) return <span className={`rl-rate ${site.rating >= 6 ? 'is-good' : 'is-low'}`}>{site.rating}/10</span>;
  return <span className="rl-rate is-none">pas noté</span>;
}

export default function WaypointsListOverlay() {
  const [here, setHere] = useState(null);
  const [list, setList] = useState([]);
  const [target, setTarget] = useState(null);
  const [drill, setDrill] = useState(null); // foreuse du Rhino suivie : la boussole la montre, pas le repère
  const [avecTaris, setAvecTaris] = useState(false);
  const [choix, setChoix] = useState(null); // niveau choisi à la souris { system, body?, site? } ; null : suit où tu es
  const guide = useHiddenWindow('waypoints-guide');
  const load = () => {
    wpApi.list().then(setList).catch(() => {});
  };
  useEffect(() => {
    load();
    wpApi.here().then(setHere).catch(() => {});
    wpApi.guideTarget().then((t) => setTarget(t.id)).catch(() => {});
    wpApi.drillGuide().then((g) => setDrill(g?.target ?? null)).catch(() => {});
  }, []);
  useEvent('waypoints:here', setHere);
  useEvent('waypoints:update', load);
  useEvent('waypoints:guide-target', (t) => setTarget(t?.id ?? null));
  useEvent('waypoints:drill-guide', (g) => setDrill(g?.target ?? null));

  const montres = visibles(list, avecTaris);
  // Prospection (notes des EEP, verdict des planètes) du système regardé : le tien, ou celui choisi
  const autre = choix?.system && !meme(choix.system, here?.system)
    ? { system: choix.system, systemAddress: list.find((w) => meme(w.system, choix.system))?.systemAddress ?? null }
    : null;
  const [survey] = useSurvey(here, autre);
  // EEP ciblé en jeu : connu par la prospection de TON système seulement, gardé pendant que tu en regardes un autre (sinon
  // le clic sur un autre système passerait pour un changement de cible, et la fenêtre repartirait aussitôt sur toi).
  // Avant le premier chargement, position et prospection sont vides : rien de ciblé.
  const cibleIci = useRef(null);
  if (survey && meme(survey.system, here?.system)) {
    cibleIci.current = here?.body && survey.current?.body === here.body ? survey.current : null;
  }
  const cible = autre ? null : cibleIci.current;
  // Changer de système, de planète ou d'EEP ciblé : la fenêtre repart sur où tu es
  const contexte = cleContexte(here, cibleIci.current);
  useEffect(() => setChoix(null), [contexte]);
  const vue = choix ?? vueAuto(here, montres, cible);

  /** 🧭 : guide vers ce repère (il reprend la boussole à une foreuse) ; sur le repère déjà suivi, cache la fenêtre de guidage. */
  async function toggleGuide(w) {
    if (w.id === target && guide.shown && drill == null) return guide.toggle();
    await wpApi.setGuideTarget(w.id);
    if (!guide.shown) guide.toggle();
  }
  // Seul le survol d'un bouton rend la fenêtre cliquable (le reste laisse passer les clics au jeu)
  const overlay = window.eliteOverlay;
  const hover = overlay && { onMouseEnter: () => overlay.setHover(true), onMouseLeave: () => overlay.setHover(false) };
  const aller = (v) => setChoix(v);

  // Prospection du système affiché seulement (pendant le chargement de l'autre, celle d'avant ne compte pas)
  const surveyVu = survey && meme(survey.system, vue.system) ? survey : null;
  const planeteSurvey = (body) => surveyVu?.planets?.find((p) => p.body === body) ?? null;
  const proche = (a, b) => (distanceTo(here, a) ?? 1e12) - (distanceTo(here, b) ?? 1e12);
  const nCaches = (l) => (avecTaris ? 0 : caches(l));
  const toutCaches = caches(list);

  // --- Fil d'Ariane : chaque niveau est un bouton ---
  const crumbs = [{ label: 'Systèmes', v: {} }];
  if (vue.system) crumbs.push({ label: vue.system, v: { system: vue.system } });
  if (vue.body) crumbs.push({ label: `Planète ${shortPlace(vue.body, vue.system)}`, v: { system: vue.system, body: vue.body } });
  if ('site' in vue) crumbs.push({ label: vue.site == null ? 'Sans EEP' : `EEP ${vue.site}`, v: vue });

  let content;
  let footer = null;
  if (!vue.system) {
    // Tous les systèmes où tu as des repères
    const sys = systemes(montres, here?.system);
    content = (
      <div className="rl-sec">
        {sys.map((s) => (
          <button key={s.system} type="button" className={`rl-nav ${meme(s.system, here?.system) ? 'is-here' : ''}`} {...hover} onClick={() => aller({ system: s.system })}>
            <span className="rl-what">{meme(s.system, here?.system) ? '📍 ' : ''}{s.system}</span>
            <span className="rl-n">{s.n} repère{s.n > 1 ? 's' : ''}</span>
            <span className="rl-chev">›</span>
          </button>
        ))}
        {!sys.length && <p className="rl-empty">Aucun repère{toutCaches ? ' actif' : ''}.</p>}
      </div>
    );
    footer = <><span className="hud-tag">Tous les systèmes</span><span>{sys.length} système{sys.length > 1 ? 's' : ''}</span></>;
  } else if (!vue.body) {
    // Un système : les planètes où tu as des repères
    const dansSysteme = list.filter((w) => meme(w.system, vue.system));
    const pl = planetes(montres, vue.system);
    const sansRepere = (surveyVu?.planets || []).filter((p) => p.verdict !== 'unknown' && !pl.some((x) => x.body === p.body));
    content = (
      <div className="rl-sec">
        <span className="rl-sec-title">Planètes avec tes repères</span>
        {pl.map((p) => {
          const s = planeteSurvey(p.body);
          const verdict = s?.verdict || 'unknown';
          const bons = (s?.ores || []).filter((o) => o.good.length).map((o) => o.ore);
          const ici = here?.body === p.body;
          return (
            <button key={p.body} type="button" className={`rl-nav ${ici ? 'is-here' : ''}`} {...hover} onClick={() => aller({ system: vue.system, body: p.body })}>
              <span className={`rl-v is-${verdict}`}>{VERDICTS[verdict].icon}</span>
              <b>{ici ? '📍' : ''}{p.nom}</b>
              <span className="rl-what">
                {s?.best != null && <span className="rl-good">{s.best}/10 </span>}
                {bons.length ? <span className="rl-good">{bons.join(' · ')}</span>
                  : verdict === 'low' && s.ores.length ? <span className="rl-dim">petits gisements : {s.ores.map((o) => o.ore).join(' · ')}</span>
                    : <span className="rl-dim">{VERDICTS[verdict].label}</span>}
              </span>
              <span className="rl-n">{p.n} rep. · {p.eeps} EEP</span>
              <span className="rl-chev">›</span>
            </button>
          );
        })}
        {!pl.length && <p className="rl-empty">Aucun repère{nCaches(dansSysteme) ? ' actif' : ''} dans ce système.</p>}
        {sansRepere.length > 0 && <p className="rl-dim">Prospectées, sans repère : {sansRepere.map((p) => p.name).join(', ')}</p>}
      </div>
    );
    footer = <><span className="hud-tag">Système</span><span>{pl.reduce((n, p) => n + p.n, 0)} repères{nCaches(dansSysteme) ? ` · ${nCaches(dansSysteme)} cachés` : ''}</span></>;
  } else if (!('site' in vue)) {
    // Une planète : ses EEP avec des repères
    const surPlanete = list.filter((w) => (w.body || w.station) === vue.body);
    const sp = planeteSurvey(vue.body);
    const liste = eeps(montres, vue.body);
    const auSol = here?.body === vue.body;
    content = (
      <div className="rl-sec">
        <span className="rl-sec-title">EEP avec tes repères</span>
        {liste.map((e) => {
          const site = sp?.sites?.find((s) => s.number === e.site);
          const ws = reperesDe(montres, vue.body, e.site).sort(proche);
          const d = auSol ? distanceTo(here, ws[0]) : null;
          const vise = cible?.site != null && cible.site === e.site;
          const minerais = site?.deposits?.length ? site.deposits.map((x) => x.ore) : [...new Set(ws.map((w) => w.label))].slice(0, 3);
          return (
            <button key={e.site ?? 'sans'} type="button" className={`rl-nav ${vise ? 'is-here' : ''}`} {...hover} onClick={() => aller({ system: vue.system, body: vue.body, site: e.site })}>
              <b>{e.site == null ? 'Sans EEP' : `${vise ? '🎯' : ''}EEP ${e.site}`}</b>
              <span className="rl-what">{e.site != null && <Note site={site} />} {minerais.join(' · ')}</span>
              {d != null && <span className="rl-dist">{meters(d)}</span>}
              <span className="rl-n">{e.n}{e.taris ? ` (${e.taris} ⏳)` : ''}</span>
              <span className="rl-chev">›</span>
            </button>
          );
        })}
        {!liste.length && <p className="rl-empty">Aucun repère{nCaches(surPlanete) ? ' actif : « ⏳ Taris » pour voir les autres' : ''} sur cette planète.</p>}
      </div>
    );
    if (sp) footer = <><span className="hud-tag">{VERDICTS[sp.verdict].icon} Planète {VERDICTS[sp.verdict].label.toLowerCase()}</span><span>{sp.seen}/{sp.count ?? '?'} EEP vus</span></>;
  } else {
    // Un EEP : ses repères, du plus proche au plus loin, 🧭 pour y aller
    const tous = reperesDe(list, vue.body, vue.site);
    const ws = reperesDe(montres, vue.body, vue.site).sort(proche);
    const site = planeteSurvey(vue.body)?.sites?.find((s) => s.number === vue.site);
    content = (
      <div className="rl-sec">
        {vue.site != null && (
          <div className="rl-eep">
            <span className="rl-eep-num">EEP {vue.site}</span>
            <Note site={site} />
            <span className="rl-ores">{site?.deposits?.length ? site.deposits.map((d) => d.ore).join(' · ') : <span className="rl-dim">minerais inconnus : 📷 pour les lire</span>}</span>
          </div>
        )}
        {ws.map((w) => {
          const guided = w.id === target && guide.shown && drill == null;
          const d = distanceTo(here, w);
          const etat = tabOf(w);
          return (
            <div key={w.id} className={`rl-row ${guided ? 'is-guided' : ''} ${etat !== 'main' ? 'is-old' : ''}`}>
              {etat === 'depleted' && <span className="rl-tag is-old">⏳ tari</span>}
              {etat === 'unprofitable' && <span className="rl-tag is-old">✗ pas rentable</span>}
              <span className="rl-label" title={w.notes || w.label}>{w.label}</span>
              {w.drills != null && <span className="rl-drills">{w.drills} forage{w.drills > 1 ? 's' : ''}</span>}
              {d != null && <span className="rl-dist">{meters(d)}</span>}
              {w.latitude != null && (
                <button type="button" className={`rl-go ${guided ? 'is-on' : ''}`} title={guided ? 'Cacher le guidage' : 'Guidage vers ce repère'} {...hover} onClick={() => toggleGuide(w)}>🧭</button>
              )}
            </div>
          );
        })}
        {!ws.length && <p className="rl-empty">{tous.length ? 'Tous taris ou pas rentables : « ⏳ Taris » pour les voir.' : 'Aucun repère ici.'}</p>}
      </div>
    );
    footer = <><span className="hud-tag">Planète {shortPlace(vue.body, vue.system)}</span><span>{ws.length} repère{ws.length > 1 ? 's' : ''}{nCaches(tous) ? ` · ${nCaches(tous)} cachés` : ''}</span></>;
  }

  return (
    <PanelOverlay title="📍 Repères" footer={footer}>
      <style>{CSS}</style>
      <div className="rl">
        <div className="rl-bar">
          {crumbs.map((c, i) => (
            <span key={c.label} style={{ display: 'contents' }}>
              {i > 0 && <span className="rl-sep">›</span>}
              {i === crumbs.length - 1
                ? <span className="rl-crumb is-here" title={c.label}>{c.label}</span>
                : <button type="button" className="rl-crumb" title={c.label} {...hover} onClick={() => aller(c.v)}>{c.label}</button>}
            </span>
          ))}
          <span className="rl-tools">
            {choix && <button type="button" className="rl-tool" title="Revenir à là où tu es" {...hover} onClick={() => setChoix(null)}>◎ Suivre</button>}
            {toutCaches > 0 && (
              <button type="button" className={`rl-tool ${avecTaris ? 'is-on' : ''}`} title="Montrer aussi les repères taris et pas rentables" {...hover} onClick={() => setAvecTaris(!avecTaris)}>
                ⏳ Taris{avecTaris ? ' ✓' : ` (${toutCaches})`}
              </button>
            )}
          </span>
        </div>
        {content}
      </div>
    </PanelOverlay>
  );
}
