// Page du chef : les rôles de l'escadron (une hiérarchie, du plus haut au plus bas), le rôle de chaque membre, et les
// installations à confirmer. Les rôles servent au partage : « partager à Lieutenant et au-dessus ».
// Le chef ne lit pas les partages des membres : seulement ceux qui lui sont adressés, comme tout le monde.

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { tenter } from '../../core/actions.js';

const base = '/modules/escadron/chef';

export default function RolesChef() {
  const [roles, setRoles] = useState(null); // enregistrés sur le serveur, du plus haut au plus bas
  const [brouillon, setBrouillon] = useState(null); // en cours de modification, sinon null
  const [membres, setMembres] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [note, setNote] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const charger = () => tenter(async () => {
    const [r, m] = await Promise.all([api(`${base}/roles/lire`, { method: 'POST' }), api(`${base}/membres/liste`, { method: 'POST' })]);
    setRoles(r.roles);
    setMembres(m.membres);
  }, setErreur);
  useEffect(() => { charger(); }, []);

  async function agir(fn, fait) {
    setOccupe(true);
    setNote(null);
    const ok = await tenter(async () => {
      await fn();
      return true;
    }, setErreur);
    setOccupe(false);
    if (ok && fait) setNote(fait);
  }

  const liste = brouillon ?? roles ?? [];
  const changer = (i, name) => setBrouillon(liste.map((r, j) => (j === i ? { ...r, name } : r)));
  const monter = (i, d) => {
    const l = [...liste];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    setBrouillon(l);
  };
  const enregistrer = () => agir(async () => {
    const r = await api(`${base}/roles`, { method: 'PUT', body: { roles: liste.map((x) => ({ id: x.id, name: x.name })) } });
    setRoles(r.roles);
    setBrouillon(null);
    setMembres((await api(`${base}/membres/liste`, { method: 'POST' })).membres);
  }, 'Rôles enregistrés.');
  const donner = (cmdr, role) => agir(async () => setMembres((await api(`${base}/membres/${encodeURIComponent(cmdr)}/role`, { method: 'PUT', body: { role: role || null } })).membres));
  const confirmer = (cmdr) => window.confirm(`Confirmer les installations en attente de CMDR ${cmdr} ? Fais-le seulement si c’est bien lui qui s’est réinscrit (autre PC, réinstallation) : elles liront les partages qui lui sont adressés.`)
    && agir(async () => setMembres((await api(`${base}/membres/${encodeURIComponent(cmdr)}/confirmer`, { method: 'POST' })).membres), `Installations de CMDR ${cmdr} confirmées.`);

  const enAttente = (membres || []).filter((m) => m.attente > 0);
  return (
    <section className="panel">
      <h2>Rôles et partage</h2>
      <p className="small muted">
        Crée les rôles de ton escadron, du plus haut au plus bas, et donne-en un à chaque membre. Un membre peut alors
        partager un repère, un build ou une route « à tel rôle et au-dessus ». Tu ne lis que ce qui t’est adressé, comme
        tout le monde : donne-toi le rôle le plus haut pour recevoir ce qui vise les rôles.
      </p>
      {erreur && <p className="small bad">{erreur} <button type="button" className="btn btn-ghost small" onClick={charger}>Réessayer</button></p>}
      {note && <p className="small good">{note}</p>}

      {roles && (
        <>
          <h3>Hiérarchie</h3>
          {!liste.length && <p className="muted small">Aucun rôle pour l’instant : sans rôle, on partage à tout l’escadron ou à des personnes précises.</p>}
          {liste.map((r, i) => (
            <div key={r.id ?? `nouveau-${i}`} className="form-actions">
              <span className="muted small">{i + 1}.</span>
              <input value={r.name} maxLength={40} onChange={(e) => changer(i, e.target.value)} placeholder="Nom du rôle (ex. Lieutenant)" aria-label={`Rôle n° ${i + 1}`} />
              <button type="button" className="btn btn-ghost small" disabled={i === 0} onClick={() => monter(i, -1)} title="Plus haut">↑</button>
              <button type="button" className="btn btn-ghost small" disabled={i === liste.length - 1} onClick={() => monter(i, 1)} title="Plus bas">↓</button>
              <button type="button" className="btn btn-ghost small" onClick={() => setBrouillon(liste.filter((_, j) => j !== i))} title="Retirer ce rôle : ses membres n’en auront plus">✕</button>
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" disabled={liste.length >= 20} onClick={() => setBrouillon([...liste, { name: '' }])}>+ Ajouter un rôle</button>
            {brouillon && <button type="button" className="btn btn-primary" disabled={occupe || brouillon.some((r) => !r.name.trim())} onClick={enregistrer}>Enregistrer les rôles</button>}
            {brouillon && <button type="button" className="btn btn-ghost" onClick={() => setBrouillon(null)}>Annuler</button>}
          </div>
        </>
      )}

      {enAttente.length > 0 && (
        <>
          <h3>Installations à confirmer</h3>
          <p className="small muted">
            Le code de l’escadron ne prouve pas qui s’inscrit. Une installation de plus sous un nom déjà inscrit envoie
            ses mérites, mais ne lit aucun partage tant qu’elle n’est pas confirmée, par le membre (depuis son autre PC) ou par toi.
          </p>
          {enAttente.map((m) => (
            <p key={m.cmdr} className="small warn">
              CMDR {m.cmdr} : {m.attente} installation{m.attente > 1 ? 's' : ''} en attente.{' '}
              <button type="button" className="btn small" disabled={occupe} onClick={() => confirmer(m.cmdr)}>Confirmer</button>
            </p>
          ))}
        </>
      )}

      {membres && roles && roles.length > 0 && !brouillon && (
        <>
          <h3>Rôle de chaque membre</h3>
          {!membres.length ? <p className="muted small">Personne n’est encore inscrit.</p> : (
            <table className="table compact">
              <thead><tr><th>Commandant</th><th>Rôle</th></tr></thead>
              <tbody>
                {membres.map((m) => (
                  <tr key={m.cmdr}>
                    <td>{m.cmdr}</td>
                    <td>
                      <select value={m.role ?? ''} disabled={occupe} onChange={(e) => donner(m.cmdr, e.target.value)} aria-label={`Rôle de ${m.cmdr}`}>
                        <option value="">aucun</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {brouillon && roles?.length > 0 && <p className="small muted">Enregistre ou annule les rôles pour retrouver la liste des membres.</p>}
    </section>
  );
}
