import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { builderApi, copy } from '../api.js';
import { BoutonPartager } from '../../../core/PartageEscadron.jsx';
import { StatsDetails, StatsSummary } from '../components/StatsPanel.jsx';
import { dec1, dec2 } from '../../../core/format.js';
import { shipTitle } from '../../../core/ShipNickname.jsx';
import { useGardeModifs } from '../../../core/gardeModifs.js';
import { empreinteBuild, modifie, texteRemarques } from '../brouillon.js';

/** Choix du point de départ : vaisseau d'origine, un de mes vaisseaux, ou un lien EDSY. */
function Starter({ onBuild }) {
  const [ships, setShips] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [shipId, setShipId] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    builderApi.ships().then(setShips).catch((e) => setError(e.message));
    builderApi.fleet().then(setFleet).catch(() => {});
  }, []);

  const run = (p) => p.then(onBuild).catch((e) => setError(e.message));
  return (
    <div className="two-cols">
      <section className="panel form" data-tuto="builds-depart-flotte">
        <h2>Partir d'un de mes vaisseaux</h2>
        {fleet.length ? (
          <div className="builder-fleet">
            {fleet.map((f) => (
              <button key={f.gameShipId} className="btn" onClick={() => run(builderApi.start({ gameShipId: f.gameShipId }))}>
                {shipTitle(f)} <span className="muted small">{shipTitle(f) !== f.ship ? f.ship : f.ident}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Aucune configuration lue dans les journaux.</p>
        )}
      </section>
      <section className="panel form">
        <h2>Vaisseau neuf</h2>
        <p className="small muted">Pour comparer avant de choisir : <Link to="/builder/vaisseaux">tous les vaisseaux, en cartes</Link> (taille, emplacements, soute, saut).</p>
        <div className="form-actions" data-tuto="builds-depart-neuf">
          <select value={shipId} onChange={(e) => setShipId(e.target.value)}>
            <option value="">Choisir un vaisseau…</option>
            {ships.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" disabled={!shipId} onClick={() => run(builderApi.start({ shipId: Number(shipId) }))}>Commencer</button>
        </div>
        <h2>Importer</h2>
        <textarea data-tuto="builds-depart-import" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://edsy.org/#/L=… ou export JSON (Loadout)" spellCheck={false} />
        <div className="form-actions">
          <button className="btn" disabled={!text.trim()} onClick={() => run(builderApi.importText(text.trim()))}>Importer</button>
          {error && <span className="bad">{error}</span>}
        </div>
      </section>
    </div>
  );
}

// Une couleur par type de module (FSD, FSD SCO, soute, bouclier…), la même dans tous les emplacements
const TYPE_COLORS = ['var(--accent)', '#6fd3ff', '#5fd38d', '#d3a6ff', '#ffd24a', '#ff6f91', '#7fe0d0', '#c9b38a', '#9fb4ff', '#f08a5d'];
const typeColor = (catalog, mtype) => TYPE_COLORS[Object.keys(catalog.mtypes).sort().indexOf(mtype) % TYPE_COLORS.length];
const RATINGS = 'ABCDEFGHI';
// Types qui regroupent plusieurs variantes (mêmes mots que les noms des modules, names.js côté serveur)
const TYPE_NAMES = {
  icr: 'Soute', isg: 'Générateur de boucliers', ipc: 'Cabine passagers', ihrp: 'Renfort de coque', imrp: 'Renfort de modules',
  ifa: "Ordinateur d'appontage", ipvh: 'Hangar de véhicule planétaire', ifh: 'Hangar à chasseurs', imlc: 'Contrôleur multi-drones',
  ihblc: 'Contrôleur de drones perce-soute', cbh: 'Blindage', cpp: 'Générateur', ct: 'Propulseurs', cfsdo: 'Réacteur FSD (SCO)',
  cpd: 'Distributeur de puissance',
};
// Nom d'un module sans classe ni note, ni capacité : « 6E Soute (64 t) » → « Soute », « 2F Multicanon (cardan) » → « Multicanon (cardan) »
const baseName = (label) => label
  .replace(/^\d+[A-I]\s+/, '')
  .replace(/\s*\(([^()]*)\)$/, (all, inner) => {
    const kept = inner.split(', ').filter((p) => !/^[\d\s\u202f]+ (t|places)$/.test(p));
    return kept.length ? ` (${kept.join(', ')})` : '';
  });
// Sinon (armes, utilitaires) : nom du module sans monture (« Multicanon (cardan) » → « Multicanon »)
const typeName = (catalog, mtype, label) => TYPE_NAMES[mtype] || baseName(label).replace(/\s*\((fixe|cardan|tourelle)\)$/i, '');
// Emplacement en court, pour la liste : « Grand point d'emport » → « Grand », « Interne (6) » → « Interne 6 »
const shortSlot = (label) => label.replace(/ point d'emport$/i, '').replace(/\s*\((\d+)\)$/, ' $1').replace(/^Soute uniquement/, 'Soute');

// Une couleur par note, sur les cases des modules
const RATING_COLORS = { A: '#ffd24a', B: '#5fd38d', C: '#6fd3ff', D: '#d3a6ff', E: 'var(--accent)' };
const MUTED = '#8a94a0';

/** Modules possibles regroupés par type : le plus grand type d'abord, et dans chacun classe décroissante puis A → E. */
function optionGroups(ids, catalog) {
  const groups = new Map();
  for (const id of ids) {
    const m = catalog.modules[id];
    if (!groups.has(m.mtype)) groups.set(m.mtype, []);
    groups.get(m.mtype).push(m);
  }
  const order = (a, b) => (b.class ?? 0) - (a.class ?? 0) || RATINGS.indexOf(a.rating) - RATINGS.indexOf(b.rating) || a.label.localeCompare(b.label, 'fr', { numeric: true });
  return [...groups.entries()]
    .map(([mtype, list]) => ({ mtype, color: typeColor(catalog, mtype), list: list.sort(order), name: typeName(catalog, mtype, list[0].label) }))
    .sort((a, b) => (b.list[0].class ?? 0) - (a.list[0].class ?? 0) || a.name.localeCompare(b.name, 'fr'));
}

/** Modules d'un type, par variante (nom sans classe ni note), puis une ligne par classe (décroissante). */
function variants(list) {
  const out = new Map();
  for (const m of list) {
    const name = baseName(m.label);
    if (!out.has(name)) out.set(name, new Map());
    const byClass = out.get(name);
    if (!byClass.has(m.class)) byClass.set(m.class, []);
    byClass.get(m.class).push(m);
  }
  return [...out.entries()].map(([name, byClass]) => ({ name, rows: [...byClass.entries()] }));
}

/** Modification, grade et effet expérimental du module de l'emplacement choisi. */
function Engineering({ value, catalog, onChange }) {
  const mod = value?.modid ? catalog.modules[value.modid] : null;
  const mt = mod ? catalog.mtypes[mod.mtype] : null;
  const blueprints = mt && !mod.nobp.includes('*') ? mt.blueprints.filter((b) => !mod.nobp.includes(b.id)) : [];
  if (!blueprints.length) return null;
  const bp = blueprints.find((b) => b.id === value.bpid);
  // Effets que ce module refuse (noexpeffects d'EDSY : tous, ou une liste)
  const noexp = mod.noexp || [];
  const effects = noexp.includes('*') ? [] : mt.expeffects.filter((x) => !noexp.includes(x.id));
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="form-actions builder-eng" data-tuto="builds-ingenierie">
      <select value={value.bpid || ''} onChange={(e) => {
        const b = blueprints.find((x) => x.id === e.target.value);
        set({ bpid: b?.id || null, grade: b ? b.maxgrade : 0, expid: b ? value.expid || null : null });
      }}>
        <option value="">sans modification</option>
        {blueprints.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
      {bp && (
        <select value={value.grade} onChange={(e) => set({ grade: Number(e.target.value) })}>
          {Array.from({ length: bp.maxgrade }, (_, i) => i + 1).map((g) => <option key={g} value={g}>G{g}</option>)}
        </select>
      )}
      {bp && effects.length > 0 && (
        <select value={value.expid || ''} onChange={(e) => set({ expid: e.target.value || null })}>
          <option value="">sans effet expérimental</option>
          {effects.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      )}
    </div>
  );
}

/**
 * Module d'un emplacement, en court : nom coloré par type (par note A → E pour les modules de base, comme les cases du
 * choix), modification à part.
 */
function slotSummary(value, catalog, groupKey) {
  const mod = value?.modid ? catalog.modules[value.modid] : null;
  if (!mod) return { label: '— vide —', color: MUTED, eng: '' };
  const mt = catalog.mtypes[mod.mtype];
  const bp = mt?.blueprints.find((b) => b.id === value.bpid);
  const exp = mt?.expeffects.find((x) => x.id === value.expid);
  const color = (groupKey === 'component' && RATING_COLORS[mod.rating]) || typeColor(catalog, mod.mtype);
  return { label: mod.label, color, eng: bp ? `G${value.grade} ${bp.label}${exp ? ` · ${exp.label}` : ''}` : '' };
}

// Emplacement de base avec sa taille maximale (« Générateur 5 ») ; le blindage n'a pas de taille
const slotName = (slot, groupKey) => (groupKey === 'component' && slot.label !== 'Blindage' && slot.size ? `${slot.label} ${slot.size}` : slot.label);

/** Emplacements du vaisseau, par groupe : un clic choisit celui à équiper. */
function SlotList({ catalog, build, selected, onSelect, groups }) {
  return catalog.groups.filter((g) => groups.includes(g.key) && catalog.slots[g.key].length).map((g) => (
    <div key={g.key} className="builder-group">
      <h3>{g.label}</h3>
      {catalog.slots[g.key].map((slot, i) => {
        const s = slotSummary(build.slots[g.key][i], catalog, g.key);
        const active = selected.g === g.key && selected.i === i;
        return (
          <button key={i} className={`builder-slot ${active ? 'is-active' : ''}`} onClick={() => onSelect({ g: g.key, i })}>
            <span className="builder-slot-size" title={slotName(slot, g.key)}>{shortSlot(slotName(slot, g.key))}</span>
            <span className="builder-slot-mod" style={{ color: s.color }}>{s.label}</span>
            {s.eng && <span className="builder-slot-eng">{s.eng}</span>}
          </button>
        );
      })}
    </div>
  ));
}

/**
 * Familles limitées déjà au maximum ailleurs sur le vaisseau (un seul générateur de boucliers…) : { clé: texte }.
 * L'emplacement choisi ne compte pas : on peut y remplacer le module limité qu'il porte. Un module installé ailleurs
 * peut relever une limite (stabilisateur d'armes expérimentales : 1 ou 2 armes expérimentales de plus), comme dans
 * depassements() côté serveur.
 */
function limitesAtteintes(catalog, build, here) {
  const n = {};
  const extra = {};
  for (const g of Object.keys(build.slots)) {
    build.slots[g].forEach((s, i) => {
      const m = s?.modid ? catalog.modules[s.modid] : null;
      if (!m || (g === here.g && i === here.i)) return;
      if (m.limit) n[m.limit] = (n[m.limit] || 0) + 1;
      if (m.unlimit) extra[m.unlimit.key] = (extra[m.unlimit.key] || 0) + m.unlimit.count;
    });
  }
  return Object.fromEntries(Object.entries(catalog.limits || {}).flatMap(([k, l]) => {
    const max = l.max + (extra[k] || 0);
    return (n[k] || 0) >= max ? [[k, l.textes?.[max] || l.texte]] : [];
  }));
}

/**
 * Tous les modules possibles dans l'emplacement choisi, façon EDSY : par type (couleur), par variante, une ligne par
 * classe (la plus grande en haut) et une case par note (A → E). Un clic équipe le module. Un module que le jeu
 * refuserait ici (famille limitée déjà au maximum : un seul générateur de boucliers…) est grisé.
 */
function ModulePicker({ slot, groupKey, value, catalog, onChange, atteintes = {} }) {
  const pick = (modid) => onChange(modid ? { modid, bpid: null, grade: 0, expid: null } : null);
  const current = value?.modid;
  const summary = slotSummary(value, catalog, groupKey);
  return (
    <>
      <div className="builder-picker-head">
        <h3>{slotName(slot, groupKey)}</h3>
        <span style={{ color: summary.color }}>{summary.label}</span>
        {groupKey !== 'component' && current && <button className="btn btn-ghost" onClick={() => pick(null)}>Vider</button>}
      </div>
      {value && <Engineering value={value} catalog={catalog} onChange={onChange} />}
      {/* Le type du module équipé en tête, puis les autres */}
      {optionGroups(slot.options, catalog).sort((a, b) => (b.mtype === catalog.modules[current]?.mtype) - (a.mtype === catalog.modules[current]?.mtype)).map((g) => {
        const vs = variants(g.list);
        return (
          <div key={g.mtype} className="picker-group" data-mtype={g.mtype} style={{ '--c': g.color }}>
            <h4>{g.name}</h4>
            {vs.map((v) => {
              const chip = (m) => {
                const interdit = m.limit && atteintes[m.limit];
                return (
                <button
                  key={m.id}
                  className={`picker-chip ${m.id === current ? 'is-active' : ''} ${interdit ? 'is-off' : ''}`}
                  style={{ '--r': RATING_COLORS[m.rating] || g.color }}
                  title={interdit ? `${m.label}\nImpossible dans le jeu, limite atteinte : ${interdit}.` : `${m.label}\n${dec1(m.mass)} t · ${dec2(m.power)} MW`}
                  disabled={Boolean(interdit)}
                  onClick={() => pick(m.id)}
                >
                  <span>{m.class}{m.rating}</span>
                  {m.info && <small>{m.info}</small>}
                </button>
                );
              };
              // Une seule note par classe (armes…) : toutes les classes sur une ligne
              const single = v.rows.every(([, mods]) => mods.length === 1);
              return (
                <div key={v.name} className="picker-variant">
                  {(vs.length > 1 || v.name !== g.name) && <span className="picker-name">{v.name}</span>}
                  {single
                    ? <div className="picker-row">{v.rows.map(([, mods]) => chip(mods[0]))}</div>
                    : v.rows.map(([cls, mods]) => <div key={cls} className="picker-row">{mods.map(chip)}</div>)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Éditeur de build, façon EDSY : chiffres clés en haut, modules de l'emplacement choisi à gauche, vaisseau en deux colonnes à droite, détail des statistiques en dessous. */
export default function BuildEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [build, setBuild] = useState(null);
  const [meta, setMeta] = useState({ id: null, gameShipId: '', notes: '' });
  const [catalog, setCatalog] = useState(null);
  const [fleet, setFleet] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // échec d'un appel (statistiques, enregistrement…)
  // Remarques du départ ou de l'import (modules non reconnus…) : à part des erreurs, pour que le calcul des
  // statistiques qui suit ne les efface pas ; elles restent jusqu'au build suivant (ou ✕)
  const [warnings, setWarnings] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // un double clic ne lance qu'un enregistrement
  // Empreinte de la dernière version enregistrée ou chargée (brouillon.js) : changements non enregistrés si elle diffère
  const [reference, setReference] = useState(null);
  const [copied, setCopied] = useState(false);
  const [inaraModules, setInaraModules] = useState(null); // modules connus d'Inara, 0 avant le chargement de la liste
  const [inara, setInara] = useState(null); // { url, missing } de la recherche Inara
  const timer = useRef(null);
  const [selected, setSelected] = useState({ g: 'component', i: 1 }); // emplacement à équiper (générateur au départ)
  const [sysPips, setSysPips] = useState(2); // pips SYS pour les boucliers (2 par défaut, comme EDSY)
  // Liste des modules (à gauche) qui ne bouge pas d'un emplacement à l'autre de la même catégorie : le type de module
  // qu'on regardait reste à la même hauteur (4 compartiments de 5 à remplir de soutes sans redescendre à chaque fois).
  const pickerRef = useRef(null);
  const ancre = useRef(null); // { g, mtype, offset } relevé juste avant le changement d'emplacement
  function choisirEmplacement(next) {
    const box = pickerRef.current;
    if (box) {
      const haut = box.getBoundingClientRect().top;
      const vu = [...box.querySelectorAll('.picker-group')].find((el) => el.getBoundingClientRect().bottom > Math.max(haut, 0) + 30);
      ancre.current = vu ? { g: selected.g, mtype: vu.dataset.mtype, offset: vu.getBoundingClientRect().top - haut } : { g: selected.g };
    }
    setSelected(next);
  }
  useLayoutEffect(() => {
    const box = pickerRef.current;
    const a = ancre.current;
    ancre.current = null;
    if (!box || !a) return;
    const defile = (dy) => {
      if (box.scrollHeight > box.clientHeight) box.scrollTop += dy;
      else window.scrollBy(0, dy); // écran étroit : la liste n'a pas sa propre barre, c'est la page qui défile
    };
    if (a.g !== selected.g) {
      if (box.scrollHeight > box.clientHeight) box.scrollTop = 0; // autre catégorie : en haut de la liste
      return;
    }
    const el = a.mtype && box.querySelector(`.picker-group[data-mtype="${CSS.escape(a.mtype)}"]`);
    if (el) defile(el.getBoundingClientRect().top - box.getBoundingClientRect().top - a.offset);
  }, [selected.g, selected.i]);

  // Build enregistré, ou vaisseau passé dans l'adresse (?depuis=ShipID, ou ?modele=<vaisseau EDSY> pour un neuf)
  useEffect(() => {
    builderApi.fleet().then(setFleet).catch(() => {});
    builderApi.inaraStatus().then((r) => setInaraModules(r.modules)).catch(() => {});
    if (id) {
      builderApi.build(id).then((b) => {
        const nb = { shipId: b.shipId, name: b.name, slots: b.slots };
        const nm = { id: b.id, gameShipId: b.gameShipId ?? '', notes: b.notes || '' };
        setBuild(nb);
        setMeta(nm);
        setReference(empreinteBuild(nb, nm));
        setWarnings(location.state?.remarques || null); // remarques de l'import, si on vient de l'enregistrer
      }).catch((e) => setError(e.message));
      return;
    }
    const q = new URLSearchParams(location.search);
    const from = q.get('depuis');
    const modele = q.get('modele'); // vaisseau neuf choisi dans « Tous les vaisseaux » (identifiant EDSY)
    if (from) builderApi.start({ gameShipId: Number(from) }).then(started).catch((e) => setError(e.message));
    else if (modele) builderApi.start({ shipId: Number(modele) }).then(started).catch((e) => setError(e.message));
  }, [id]);

  function started(r) {
    const nm = { id: null, gameShipId: r.gameShipId ?? '', notes: '' };
    setBuild(r.build);
    setMeta(nm);
    // Point de départ : rien n'est encore perdu tant que le joueur n'y a pas touché
    setReference(empreinteBuild(r.build, nm));
    setWarnings(texteRemarques(r.warnings));
  }

  // Changements non enregistrés : indiqués dans l'en-tête, et quitter la page demande confirmation
  const nonEnregistre = modifie(build, meta, reference);
  useGardeModifs(nonEnregistre, 'Ton build a des modifications non enregistrées. Quitter quand même la page ?');

  useEffect(() => {
    if (build?.shipId != null && catalog?.shipId !== build.shipId) builderApi.catalog(build.shipId).then(setCatalog).catch((e) => setError(e.message));
  }, [build?.shipId]);

  // Statistiques recalculées après chaque changement (regroupés)
  useEffect(() => {
    if (!build) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      builderApi.stats({ ...build, sysPips }).then((r) => {
        setResult(r);
        setError(null);
      }).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [build, sysPips]);

  // Recherche d'équipement d'Inara : adresse préparée d'avance (vaisseau, modules, système actuel), pour que le
  // bouton soit un vrai lien et que l'onglet s'ouvre directement sur Inara. Refaite au survol : le système a pu changer.
  const refreshInara = () => {
    if (build && inaraModules) builderApi.inara(build).then(setInara).catch(() => setInara(null));
  };
  useEffect(refreshInara, [build, inaraModules]);

  if (!build) return (
    <div className="page">
      {error && <p className="bad">{error}</p>}
      <Starter onBuild={started} />
    </div>
  );
  if (!catalog || catalog.shipId !== build.shipId) return <p className="muted">{error || 'Chargement du vaisseau…'}</p>;

  const setSlot = (g, i, v) => setBuild((b) => ({ ...b, slots: { ...b.slots, [g]: b.slots[g].map((x, k) => (k === i ? v : x)) } }));
  const sameModel = fleet.filter((f) => f.shipId === build.shipId);
  // Emplacement choisi, ramené au premier s'il n'existe pas sur ce vaisseau
  const pickSlot = catalog.slots[selected.g]?.[selected.i] ? selected : { g: 'component', i: 0 };

  async function save(asNew = false) {
    if (savingRef.current) return; // un enregistrement est déjà en cours (double clic)
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const body = { ...build, gameShipId: meta.gameShipId === '' ? null : Number(meta.gameShipId), notes: meta.notes };
    const envoye = empreinteBuild(build, meta); // ce qui part au serveur : un changement fait pendant l'envoi reste à enregistrer
    try {
      const r = meta.id && !asNew ? await builderApi.update(meta.id, body) : await builderApi.create(body);
      setSaved(new Date());
      setReference(envoye);
      // Les remarques d'import suivent le build sur sa nouvelle adresse (la page s'y recharge)
      if (r.id !== meta.id) navigate(`/builder/build/${r.id}`, { replace: true, state: warnings ? { remarques: warnings } : undefined });
      setMeta((m) => ({ ...m, id: r.id }));
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Liste des modules d'Inara, lue dans la page « recherche d'équipement » enregistrée (Ctrl+S)
  async function importInara(file) {
    if (!file) return;
    try {
      const r = await builderApi.inaraImport(await file.text());
      setInaraModules(r.modules);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function share() {
    if (result && (await copy(result.share))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="page">
      <section className="panel form-actions builder-head">
        <input className="builder-name" data-tuto="builds-nom" value={build.name} onChange={(e) => setBuild({ ...build, name: e.target.value })} placeholder={`Nom du build (ex. ${catalog.name} full défense)`} />
        <span className="muted">{catalog.name}</span>
        <label className="check" data-tuto="builds-pour">
          pour
          <select value={meta.gameShipId} onChange={(e) => setMeta({ ...meta, gameShipId: e.target.value })}>
            <option value="">aucun vaisseau précis</option>
            {sameModel.map((f) => <option key={f.gameShipId} value={f.gameShipId}>{shipTitle(f)}{f.ident ? ` (${f.ident})` : ''}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" data-tuto="builds-enregistrer" onClick={() => save(false)} disabled={!build.name.trim() || saving}>
          {saving ? 'Enregistrement…' : meta.id ? 'Enregistrer' : 'Enregistrer le build'}
        </button>
        {meta.id && <button className="btn" data-tuto="builds-enregistrer-nouveau" onClick={() => save(true)} disabled={!build.name.trim() || saving}>Enregistrer comme nouveau</button>}
        <button className="btn" data-tuto="builds-copier" onClick={share} disabled={!result}>{copied ? 'Copié ✓' : 'Partager le build'}</button>
        {meta.id && <BoutonPartager kind="build" refId={meta.id} titre={build.name || 'Build'} apercu={`${catalog.name}${nonEnregistre ? ' · la version enregistrée part, pas tes modifications en cours' : ''}`} className="btn" />}
        {inaraModules ? (
          <a
            data-tuto="builds-inara"
            className={`btn ${inara ? '' : 'disabled'}`}
            href={inara?.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={refreshInara}
            title="Nouvel onglet : où acheter le vaisseau et tous ses modules, autour de ton système (Inara met 10 à 20 s à répondre)"
          >
            Chercher sur Inara ↗
          </a>
        ) : inaraModules === 0 && (
          <label className="btn" data-tuto="builds-inara" title="Page « recherche d'équipement » d'Inara enregistrée avec Ctrl+S (HTML uniquement)">
            Charger la liste Inara
            <input type="file" accept=".html,.htm" hidden onChange={(e) => importInara(e.target.files[0])} />
          </label>
        )}
        {result?.edsy && <a className="btn btn-ghost" data-tuto="builds-edsy" href={result.edsy} target="_blank" rel="noopener noreferrer">Ouvrir dans EDSY ↗</a>}
        {nonEnregistre
          ? <span className="small warn">Modifications non enregistrées</span>
          : saved && <span className="small good">Enregistré à {saved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
        {error && <span className="bad small">{error}</span>}
        {warnings && (
          <span className="small warn">
            À vérifier : {warnings}{' '}
            <button className="btn btn-ghost small" onClick={() => setWarnings(null)} aria-label="Masquer les remarques" title="Masquer">✕</button>
          </span>
        )}
        {inara?.missing.length > 0 && <span className="small muted">Absents de la liste Inara : {inara.missing.join(', ')}</span>}
      </section>

      <section className="panel builder-summary-panel" data-tuto="builds-resume">
        <div className="form-actions builder-pips" data-tuto="builds-pips" title="Pips du distributeur sur SYS : réduisent les dégâts sur les boucliers et règlent leur recharge. EDSY ouvre un build à 2.">
          <span className="small muted">Pips SYS</span>
          {[0, 1, 2, 3, 4].map((p) => (
            <button key={p} className={`btn small ${sysPips === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSysPips(p)}>{p}</button>
          ))}
        </div>
        <StatsSummary result={result} />
      </section>

      <div className="builder-layout">
        <section className="panel builder-picker" data-tuto="builds-choix" ref={pickerRef}>
          <ModulePicker
            key={`${pickSlot.g}-${pickSlot.i}`}
            slot={catalog.slots[pickSlot.g][pickSlot.i]}
            groupKey={pickSlot.g}
            value={build.slots[pickSlot.g][pickSlot.i]}
            catalog={catalog}
            onChange={(v) => setSlot(pickSlot.g, pickSlot.i, v)}
            atteintes={limitesAtteintes(catalog, build, pickSlot)}
          />
        </section>
        <section className="panel builder-ship" data-tuto="builds-emplacements">
          <div className="builder-ship-cols">
            <div>
              <SlotList catalog={catalog} build={build} selected={pickSlot} onSelect={choisirEmplacement} groups={['hardpoint', 'utility', 'component']} />
            </div>
            <div>
              <SlotList catalog={catalog} build={build} selected={pickSlot} onSelect={choisirEmplacement} groups={['internal', 'military']} />
              <label className="form builder-notes" data-tuto="builds-notes">
                Notes
                <textarea rows={3} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
              </label>
            </div>
          </div>
        </section>
      </div>

      <StatsDetails
        result={result}
        slotLabel={(i) => catalog.slots.hardpoint[i]?.label || ''}
        weaponLabel={(i) => catalog.modules[build.slots.hardpoint[i]?.modid]?.label || '—'}
      />
    </div>
  );
}
