import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useEvent } from '../../core/stream.js';
import { ago, dateTime, int, pct } from '../../core/format.js';
import NomSysteme from '../../core/NomSysteme.jsx';
import Progress from './Progress.jsx';
import { colApi, projetApi } from './api.js';
import { KIND_LABELS, releveText, stationLabel, statusOf, toBuyList, tonnes } from './view.js';

/**
 * Projet de colonisation de l'escadron (page Colonisation) : les chantiers que le chef a choisis, dans son ordre de
 * priorité, avec ce qu'il manque à chacun, tenu à jour par les relevés des membres qui y passent. Le chef le compose
 * ici même (ce PC gère le serveur de l'escadron). Rien ne s'affiche sans escadron rejoint.
 */
export default function ProjetEscadron() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [edition, setEdition] = useState(false);
  const load = () => colApi.escadron().then(setData).catch(() => {});
  useEffect(() => {
    load();
    // Relit le serveur de l'escadron en arrivant sur la page (au plus toutes les 30 s ; refus si le projet n'est pas suivi)
    projetApi.lire().then(load).catch(() => {});
  }, []);
  useEvent('escadron:colonisation', load);
  useEvent('colonisation:update', load);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const e = data?.escadron;
  if (!e || (!e.pret && !e.chef)) return null; // pas d'escadron (ou module absent, démonstration)
  const editeur = edition && e.chef && <EditeurProjet data={data} onClose={() => setEdition(false)} onSaved={() => run(() => projetApi.lire(true))} />;

  if (!e.actif) {
    return (
      <section className="panel">
        <h2>Projet de l’escadron</h2>
        <p className="small">
          Le chef de ton escadron peut publier un projet de colonisation : les systèmes visés et leurs chantiers, dans
          l’ordre où les construire. En le suivant, tu vois ici ce qu’il manque à chaque chantier, tenu à jour par les
          relevés des membres qui y passent, et le HUD te donne le premier chantier en cours.
        </p>
        <p className="tiny muted">
          Ce que ton app envoie au serveur de l’escadron : le relevé du dépôt des chantiers des systèmes du projet
          (avancement, demandé et livré par marchandise, heure du relevé), avec ton nom de commandant. Jamais tes autres
          chantiers, ni ta soute.
        </p>
        <div className="form-actions">
          {e.pret
            ? <button className="btn btn-primary" disabled={busy} onClick={() => run(() => projetApi.activer(true))}>Suivre le projet de l’escadron</button>
            : <Link className="btn" to="/escadron/rejoindre">Rejoindre l’escadron</Link>}
          {e.chef && !edition && <button className="btn" onClick={() => setEdition(true)}>Composer le projet (chef)</button>}
          {error && <span className="small bad">{error}</span>}
        </div>
        {editeur}
      </section>
    );
  }

  const p = data.projet;
  const first = p?.sites.find((s) => s.known !== false && !s.complete && !s.failed);
  const premiers = first?.plan ? toBuyList(first.plan.items, 5) : [];
  return (
    <section className="panel live">
      <div className="form-actions">
        <h2>Projet de l’escadron</h2>
        {e.version != null && <span className="small muted">version {e.version}{e.updatedAt ? `, publiée le ${dateTime(e.updatedAt)}` : ''}</span>}
        <span className="small muted">{e.luAt ? `lu ${ago(e.luAt)}` : 'pas encore lu'}</span>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => projetApi.lire(true))}>Actualiser</button>
        {e.chef && !edition && <button className="btn" onClick={() => setEdition(true)}>Modifier le projet (chef)</button>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => projetApi.activer(false))}>Ne plus suivre</button>
      </div>
      {e.erreur && <p className="small bad">{e.erreur}</p>}
      {error && <p className="small bad">{error}</p>}
      {editeur}
      {!p ? (
        <p className="muted small">{e.attente ? 'Cette installation attend d’être confirmée (Paramètres, ou par le chef).' : 'Aucun projet publié par le chef pour l’instant.'}</p>
      ) : (
        <>
          {first && premiers.length > 0 && (
            <p className="small"><strong>En priorité, pour {first.label} :</strong> {premiers.map((i) => `${i.name} ${int(i.toBuy)} t`).join(' · ')}</p>
          )}
          <ChantiersTable rows={p.sites} classes />
          {p.others.length > 0 && (
            <>
              <h3>Autres chantiers dans les systèmes du projet</h3>
              <p className="tiny muted">Relevés par des membres ou suivis ici, mais pas encore classés par le chef.</p>
              <ChantiersTable rows={p.others} />
            </>
          )}
          {p.empty.length > 0 && (
            <p className="small muted">Aucun chantier encore connu dans : {p.empty.join(', ')}. Il apparaîtra dès qu’un membre qui suit le projet s’y amarre.</p>
          )}
          <p className="tiny muted">
            Pour chaque chantier, la lecture du dépôt la plus récente l’emporte : la tienne, ou celle d’un membre de
            l’escadron (tes livraisons faites depuis y sont ajoutées). « À acheter » déduit ta soute pour le premier
            chantier en cours, ou celui où tu es à quai.
          </p>
        </>
      )}
    </section>
  );
}

/** Chantiers du projet : rang du chef (s'il les a classés), avancement, reste, à acheter, trajets, d'où vient la lecture. */
function ChantiersTable({ rows, classes = false }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {classes && <th className="right">#</th>}
            <th>Chantier</th>
            <th>Avancement</th>
            <th className="right">Reste</th>
            <th className="right">À acheter</th>
            <th className="right">Trajets</th>
            <th>Lecture</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const sub = [KIND_LABELS[s.kind], s.system].filter(Boolean).join(' · ');
            if (s.known === false && !s.plan) {
              return (
                <tr key={s.marketId} className="row-muted">
                  {classes && <td className="right num">{s.priority}</td>}
                  <td>{s.label}<div className="tiny muted">{s.system ? <NomSysteme nom={s.system} /> : `MarketID ${s.marketId}`}</div></td>
                  <td colSpan={5} className="small muted">Pas encore relevé : il le sera au premier amarrage d’un membre qui suit le projet.</td>
                </tr>
              );
            }
            const status = statusOf(s);
            return (
              <tr key={s.marketId} className={s.docked ? 'row-current' : s.complete || s.failed ? 'row-muted' : ''}>
                {classes && <td className="right num">{s.priority}</td>}
                <td>
                  <Link to={`/colonisation/${s.marketId}`}>{s.label}</Link>
                  <div className="tiny muted">{sub || `MarketID ${s.marketId}`}</div>
                </td>
                <td style={{ minWidth: 140 }}>
                  <Progress value={s.progress} done={s.complete} />
                  <span className="tiny muted">{pct(s.progress)} </span><span className={`pill pill-${status.tone}`}>{status.label}</span>
                </td>
                <td className="right num">{s.known ? tonnes(s.plan.totals.remaining) : '?'}</td>
                <td className="right num">{s.known ? tonnes(s.plan.totals.toBuy) : '?'}</td>
                <td className="right num">{s.plan.trips == null ? '—' : int(s.plan.trips)}</td>
                <td className="small muted">{s.releve ? releveText(s.releve) : s.updatedAt ? `ta lecture, ${ago(s.updatedAt)}` : 'jamais lu'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Le chef compose le projet : les systèmes visés, puis leurs chantiers dans l'ordre de priorité. Les chantiers
 * proposés sont ceux que ce PC suit et ceux que les membres ont relevés dans ces systèmes (un chantier n'existe
 * qu'une fois la construction lancée en jeu). Publier remplace le projet du serveur pour tout l'escadron.
 */
function EditeurProjet({ data, onClose, onSaved }) {
  const [serveur, setServeur] = useState(null);
  const [systems, setSystems] = useState([]);
  const [sites, setSites] = useState([]);
  const [nouveau, setNouveau] = useState('');
  const [ajout, setAjout] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    projetApi.serveur().then((r) => {
      setServeur(r);
      setSystems(r.projet?.systems ?? []);
      setSites(r.projet?.sites ?? []);
    }).catch((err) => {
      setError(err.message);
      setServeur({ releves: [] });
    });
  }, []);
  if (!serveur) return <p className="small muted">Lecture du projet sur le serveur de l’escadron…</p>;

  const dans = new Set(systems.map((s) => s.toLowerCase()));
  const candidats = new Map();
  for (const c of data.mesChantiers ?? []) {
    if (c.system && dans.has(c.system.toLowerCase())) candidats.set(c.marketId, { marketId: c.marketId, system: c.system, name: c.label });
  }
  for (const r of serveur.releves ?? []) {
    if (r.system && dans.has(r.system.toLowerCase()) && !candidats.has(r.marketId)) {
      candidats.set(r.marketId, { marketId: r.marketId, system: r.system, name: stationLabel(r.station) || `Chantier ${r.marketId}` });
    }
  }
  const libres = [...candidats.values()].filter((c) => !sites.some((s) => s.marketId === c.marketId));
  const nomDe = (s) => s.name || candidats.get(s.marketId)?.name || `Chantier ${s.marketId}`;
  const suggestions = (data.mesSystemes ?? []).filter((s) => !dans.has(s.toLowerCase()));

  const ajouterSysteme = () => {
    const nom = nouveau.trim();
    if (nom && !dans.has(nom.toLowerCase())) setSystems([...systems, nom]);
    setNouveau('');
  };
  const retirerSysteme = (nom) => {
    setSystems(systems.filter((s) => s !== nom));
    setSites(sites.filter((s) => s.system.toLowerCase() !== nom.toLowerCase()));
  };
  const deplacer = (i, d) => {
    const l = [...sites];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setSites(l);
  };
  async function publier() {
    setBusy(true);
    setError(null);
    try {
      await projetApi.publier({ systems, sites: sites.map((s) => ({ marketId: s.marketId, system: s.system, name: nomDe(s) })) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function arreter() {
    if (!window.confirm('Arrêter le projet de colonisation ? Il disparaît pour tout l’escadron, avec tous ses relevés.')) return;
    setBusy(true);
    setError(null);
    try {
      await projetApi.arreter();
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: '0.9rem' }}>
      <h3>Composer le projet</h3>
      {serveur.version != null && <p className="tiny muted">Sur le serveur : version {serveur.version}, publiée le {dateTime(serveur.updatedAt)}.</p>}

      <h4>1. Systèmes visés</h4>
      {systems.length ? (
        <ul className="notes">
          {systems.map((s) => (
            <li key={s}><NomSysteme nom={s} /> <button className="btn btn-ghost" onClick={() => retirerSysteme(s)} title="Retirer ce système (et ses chantiers des priorités)">✕</button></li>
          ))}
        </ul>
      ) : <p className="small muted">Aucun système pour l’instant.</p>}
      <div className="form-actions">
        <input list="colo-systemes" value={nouveau} maxLength={64} placeholder="Nom exact du système (comme dans le jeu)" onChange={(ev) => setNouveau(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') ajouterSysteme(); }} />
        <datalist id="colo-systemes">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <button className="btn" disabled={!nouveau.trim() || systems.length >= 10} onClick={ajouterSysteme}>Ajouter le système</button>
      </div>
      <p className="tiny muted">10 systèmes au plus. Proposés : tes revendications et les systèmes de tes chantiers.</p>

      <h4>2. Chantiers, dans l’ordre où les construire</h4>
      {sites.length ? (
        <ol className="notes">
          {sites.map((s, i) => (
            <li key={s.marketId}>
              {nomDe(s)} <span className="tiny muted">{s.system}</span>{' '}
              <button className="btn btn-ghost" disabled={i === 0} onClick={() => deplacer(i, -1)} title="Monter">↑</button>
              <button className="btn btn-ghost" disabled={i === sites.length - 1} onClick={() => deplacer(i, 1)} title="Descendre">↓</button>
              <button className="btn btn-ghost" onClick={() => setSites(sites.filter((x) => x.marketId !== s.marketId))} title="Retirer des priorités">✕</button>
            </li>
          ))}
        </ol>
      ) : <p className="small muted">Aucun chantier classé : les membres verront quand même tous les chantiers des systèmes du projet.</p>}
      {libres.length > 0 ? (
        <div className="form-actions">
          <select value={ajout} onChange={(ev) => setAjout(ev.target.value)}>
            <option value="">Choisir un chantier…</option>
            {libres.map((c) => <option key={c.marketId} value={c.marketId}>{c.name} · {c.system}</option>)}
          </select>
          <button className="btn" disabled={!ajout || sites.length >= 40} onClick={() => {
            const c = candidats.get(Number(ajout));
            if (c) setSites([...sites, c]);
            setAjout('');
          }}>Ajouter à la suite</button>
        </div>
      ) : (
        <p className="tiny muted">
          {systems.length ? 'Aucun autre chantier connu dans ces systèmes. ' : ''}Un chantier apparaît ici dès que tu t’y es
          amarré, ou qu’un membre qui suit le projet l’a relevé (publie d’abord les systèmes).
        </p>
      )}

      <div className="form-actions" style={{ marginTop: '0.9rem' }}>
        <button className="btn btn-primary" disabled={busy || !systems.length} onClick={publier}>Publier à l’escadron</button>
        <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Annuler</button>
        {serveur.version != null && <button className="btn btn-ghost" disabled={busy} onClick={arreter}>Arrêter le projet</button>}
        {error && <span className="small bad">{error}</span>}
      </div>
      <p className="tiny muted">Publier remplace le projet du serveur pour tout l’escadron. Les relevés d’un système retiré sont effacés.</p>
    </div>
  );
}
