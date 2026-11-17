import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useEvent } from '../../core/stream.js';
import { dec2, int } from '../../core/format.js';
import { expansionApi } from './api.js';
import PlannerTab from './PlannerTab.jsx';
import HistoryTab from './HistoryTab.jsx';
import SaleTab from './SaleTab.jsx';
import RatesTab from './RatesTab.jsx';
import WhereTab from './WhereTab.jsx';
import RouteEditor from './RouteEditor.jsx';
import OngletsRoutes from './OngletsRoutes.jsx';

const ROLES = {
  'held-stronghold': { label: 'Déjà Forteresse', pill: '' },
  'held-fortified': { label: 'Déjà Consolidé', pill: '' },
  fortified: { label: 'Consolidé', pill: '' },
  stronghold: { label: 'Monter en Forteresse', pill: 'pill-eep' },
  target: { label: 'Arrivée', pill: '' },
};

/** Copie le nom du système, à coller dans la carte de la galaxie. */
function CopyName({ name }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return <button className="btn btn-ghost small" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</button>;
}

const BUSY = 'Termine ou annule d’abord la modification en cours';

/** `busy` : une autre route est ouverte dans l'éditeur ; l'ouvrir ici effacerait ce qui n'est pas enregistré. */
function Project({ p, onEdit, onRemove, removeError, busy }) {
  return (
    <section className="panel">
      <div className="form-actions">
        <h2>{p.name}</h2>
        <button className="btn btn-ghost small" disabled={busy} title={busy ? BUSY : undefined} onClick={() => onEdit(p)}>Modifier</button>
        <button className="btn btn-ghost small" onClick={() => onRemove(p)}>Supprimer</button>
      </div>
      {removeError && <p className="small bad">Suppression impossible : {removeError}</p>}
      {p.description && <p className="small">{p.description}</p>}
      <p className="small muted">
        {int(p.toTake)} systèmes à prendre · {int(p.strongholds)} à monter en Forteresse · {dec2(p.distance)} AL · saut le plus long {dec2(p.longest)} AL
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Système</th><th>Saut</th><th>À faire</th><th /></tr></thead>
          <tbody>
            {p.steps.map((s, i) => (
              <tr key={s.name}>
                <td className="num">{i}</td>
                <td>{s.name}</td>
                <td className="num">{i ? `${dec2(s.jump)} AL` : '—'}</td>
                <td><span className={`pill ${ROLES[s.role]?.pill ?? ''}`}>{ROLES[s.role]?.label ?? s.role}</span></td>
                <td><CopyName name={s.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Chargement raté : le message, et de quoi réessayer (au lieu de rester sur « Chargement… »). */
function LoadError({ message, onRetry }) {
  return (
    <section className="panel">
      <p className="bad">Les routes d’extension n’ont pas pu être chargées : {message}</p>
      <p className="small muted">Le serveur de l’app est peut-être en train de redémarrer.</p>
      <button className="btn" onClick={onRetry}>Réessayer</button>
    </section>
  );
}

const TABS = { history: 'Historique des mérites', sale: 'Mérites à la vente', rates: 'Mérites par heure', routes: "Routes d'extension", planner: 'Calculateur de routes', where: 'Où agir cette semaine' };

/** Onglet dans l'adresse (?onglet=vente…) : le menu de l'app mène droit à l'onglet voulu. */
export const ONGLETS = { history: 'historique', sale: 'vente', rates: 'merites-heure', routes: 'routes', planner: 'calculateur', where: 'ou-agir' };
const PAR_ONGLET = Object.fromEntries(Object.entries(ONGLETS).map(([k, v]) => [v, k]));

export default function ExpansionPage() {
  const [params, setParams] = useSearchParams();
  const tab = PAR_ONGLET[params.get('onglet')] || 'history';
  const setTab = (key) => setParams(key === 'history' ? {} : { onglet: ONGLETS[key] });
  const [projects, setProjects] = useState(null);
  const [listError, setListError] = useState(null);
  const [reach, setReach] = useState(null); // portée de chaque objectif, d'après le dépôt des règles du serveur
  const [editing, setEditing] = useState(null); // 'new', l'identifiant d'une route, ou null
  const [notice, setNotice] = useState(null);
  const [removeError, setRemoveError] = useState(null); // { id, message }
  const [shown, setShown] = useState(null); // route affichée dans « Routes d'extension » : un onglet par route
  const load = () => expansionApi.list()
    .then((list) => {
      setProjects(list);
      setListError(null);
    })
    .catch((err) => setListError(err.message || 'erreur inconnue'));
  useEffect(() => {
    load();
    expansionApi.rules().then((r) => setReach(r?.reach ?? null)).catch(() => setReach(null));
  }, []);
  useEvent('expansion:update', load);

  async function remove(p) {
    if (!window.confirm(`Supprimer « ${p.name} » ?`)) return;
    setRemoveError(null);
    try {
      await expansionApi.remove(p.id);
      setNotice(`Route « ${p.name} » supprimée.`);
      load();
    } catch (err) {
      setRemoveError({ id: p.id, message: err.message });
    }
  }

  function edit(p) {
    setNotice(null);
    setEditing(p ? p.id : 'new');
  }

  function saved(p) {
    setEditing(null);
    if (p?.id != null) setShown(String(p.id));
    setNotice(`Route « ${p.name} » enregistrée.`);
    load();
  }

  const loading = !projects && !listError;
  // Sans choix (ou route supprimée) : la plus récente, première de la liste
  const current = projects?.find((p) => String(p.id) === shown) ?? projects?.[0] ?? null;
  return (
    <div className="page">
      <h1>Projet extension</h1>
      <div className="form-actions" data-tuto="extension-onglets">
        {Object.entries(TABS).map(([key, label]) => (
          <button key={key} className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'planner' && <PlannerTab />}
      {tab === 'sale' && <SaleTab />}
      {tab === 'rates' && <RatesTab />}
      {tab === 'where' && <WhereTab />}
      {(tab === 'history' || tab === 'routes') && listError && !projects && <LoadError message={listError} onRetry={load} />}
      {tab === 'history' && (projects ? <HistoryTab projects={projects} /> : loading && <p className="muted">Chargement…</p>)}
      {tab === 'routes' && (
        <>
          {loading && <p className="muted">Chargement…</p>}
          {notice && <p className="small good">{notice}</p>}
          {projects && (
            <OngletsRoutes
              projects={projects}
              selected={editing === 'new' ? 'new' : current?.id}
              onSelect={(id) => (id === 'new' ? edit(null) : (setNotice(null), setShown(id)))}
              extra={[{ id: 'new', label: '+ Nouvelle route' }]}
              disabled={editing != null}
              title={BUSY}
            />
          )}
          {projects && editing === 'new' && <RouteEditor project={null} reach={reach} onSaved={saved} onCancel={() => setEditing(null)} />}
          {projects?.length === 0 && editing !== 'new' && (
            <p className="muted">
              Aucune route enregistrée. Crée la première : ton départ (un système déjà tenu par ta puissance), les systèmes à
              prendre dans l’ordre, et l’arrivée.
            </p>
          )}
          {current && editing !== 'new' && (editing === current.id
            ? <RouteEditor key={current.id} project={current} reach={reach} onSaved={saved} onCancel={() => setEditing(null)} />
            : <Project key={current.id} p={current} onEdit={edit} onRemove={remove} removeError={removeError?.id === current.id ? removeError.message : null} busy={editing != null} />)}
        </>
      )}
    </div>
  );
}
