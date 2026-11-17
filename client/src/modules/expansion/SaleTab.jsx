// Onglet « Mérites à la vente » : à quai, ce que ta soute rapporterait ici, lot par lot ; les ratios mérites / crédits
// mesurés sur tes ventes ; les ventes mesurées (dont celles à 0 mérite, avec leur cause probable), à copier en texte.
// Rien n'est automatique : l'app conseille, tu vends.

import { useEffect, useRef, useState } from 'react';
import { useEvent, useNow } from '../../core/stream.js';
import { cr, dateTime, int, pct } from '../../core/format.js';
import { saleApi } from './saleApi.js';
import NomSysteme from '../../core/NomSysteme.jsx';
import {
  ageText, KINDS, labelOf, lastSaleText, meritsText, MODES, priceAge, priceChange, priceSource, ratioSourceText, saleValue, VERDICTS,
} from './saleView.js';

const LEVELS = { bad: 'alert alert-danger', warn: 'alert alert-warning', info: 'alert', ok: 'alert' };
const verdictOf = (l) => (Object.hasOwn(VERDICTS, l.verdict) ? VERDICTS[l.verdict] : VERDICTS.unsure);

function Price({ price, now }) {
  if (!price) return <span className="muted small">ouvre le marché en jeu</span>;
  const change = priceChange(price);
  return (
    <>
      {cr(price.sellPrice)}
      <div className="small muted">{priceSource(price)} · {ageText(priceAge(price, now))}</div>
      {change != null && Math.abs(change) >= 0.005 && (
        <div className={`small ${change < 0 ? 'bad' : 'good'}`}>{change > 0 ? '+' : ''}{pct(change)} depuis ta vente du {dateTime(price.previous.at)}</div>
      )}
    </>
  );
}

function Demand({ line }) {
  if (line.noDemand) return <span className="bad small">la station n'achète pas</span>;
  if (line.price?.demand == null) return <span className="muted">—</span>;
  const b = line.bulk;
  return (
    <>
      {int(line.price.demand)} t
      {b && (
        <div className="small warn">
          moins de 4 × {int(line.count)} t : vends au plus {int(b.limit)} t à la fois
          {b.parts.length > 0 && <> ({b.parts.map(int).join(', ')} t)</>}
          {b.leftover > 0 && <>, le reste ({int(b.leftover)} t) ailleurs ou plus tard</>}
        </div>
      )}
    </>
  );
}

export function Forecast({ f, now }) {
  if (!f) return <p className="muted">Chargement…</p>;
  if (!f.docked) return <p className="muted">Pas à quai. La prévision s'affiche dès que tu es à quai avec une soute.</p>;
  return (
    <>
      <p className="small">
        <b>{f.station}</b> · <NomSysteme nom={f.system} /> · {f.here.place}{f.here.mode ? ` · ${labelOf(MODES, f.here.mode)}` : ''}
        {f.power ? ` · pour ${f.power}` : ''}
      </p>
      {f.message && <p className={LEVELS[f.message.level]}>{f.message.text}</p>}
      {f.lastSale && <p className="small">Dernière vente de l'escale : {lastSaleText(f.lastSale)}</p>}
      {f.waiting > 0 && <p className="small muted">Vente en attente de ses mérites (une minute au plus)…</p>}
      {f.lines.length === 0 && <p className="muted small">Rien à vendre dans la soute.</p>}
      {f.lines.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Marchandise</th><th className="num">Soute</th><th>Provenance</th><th>Prix ici</th><th>Demande</th><th className="num">Mérites prévus</th></tr></thead>
            <tbody>
              {f.lines.map((l) => (
                <tr key={l.type} className={l.verdict === 'zero' ? 'row-bad' : ''}>
                  <td>{l.label}</td>
                  <td className="num">{int(l.count)} t</td>
                  <td>
                    <span className={`pill ${verdictOf(l).pill}`}>{verdictOf(l).label}</span> {l.origin}
                    {l.lots.filter((x) => x.ok !== true || (x.unverified && l.unverified > 0)).slice(0, 2).map((x, i) => <div key={i} className="small muted">{x.text}</div>)}
                  </td>
                  <td><Price price={l.price} now={now} /></td>
                  <td><Demand line={l} /></td>
                  <td className="num">
                    {l.estimated ? <span className="warn" title="Ratio extrapolé de l'autre mode : estimation à vérifier">{meritsText(l.merits)} ?</span> : meritsText(l.merits)}
                    {l.ratio &&<div className="small muted">{int(l.ratio.value)} / M cr, {ratioSourceText(l.ratio)} ({l.ratio.n} vente{l.ratio.n > 1 ? 's' : ''})</div>}
                    {!l.ratio && l.eligible > 0 && <div className="small muted">pas encore de mesure</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {f.lines.length > 0 && (
        <p className="small">
          Total : <b className={f.total.estimated && f.total.merits > 0 ? 'warn' : undefined}>{meritsText(f.total.merits)}{f.total.estimated && f.total.merits > 0 ? ' ?' : ''}</b> mérite{f.total.merits === 0 ? '' : 's'}{f.total.complete ? '' : ' (sans les lignes sans prix ou sans mesure)'}
          {f.total.zero > 0 && <> · <span className="bad">{int(f.total.zero)} t à 0 probable</span></>}
          {f.total.unsure > 0 && <> · <span className="warn">{int(f.total.unsure)} t incertaines</span></>}
          {f.total.unverified > 0 && <> · <span className="warn">{int(f.total.unverified)} t comptent d’après une règle jamais vue créditée</span></>}
          {f.total.estimated && <> · <span className="warn">mérites estimés (ratio extrapolé), à vérifier</span></>}
        </p>
      )}
    </>
  );
}

export function Cases({ data, zero, setZero }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const { text } = await saleApi.text(zero);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="panel" data-tuto="extension-vente-mesurees">
      <div className="form-actions">
        <h2>Ventes mesurées</h2>
        <label className="small" data-tuto="extension-vente-zero"><input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> seulement les 0 mérite</label>
        <button className="btn btn-ghost small" data-tuto="extension-vente-copier" onClick={copy}>{copied ? 'Copié ✓' : 'Copier en texte (Discord)'}</button>
      </div>
      <p className="small muted">
        Chaque vente suivie de ses mérites dans la minute, avec ce qui était prévu. Sans mérites, la cause la plus probable d'après
        la provenance de chaque tonne. Le texte copié ne contient ni ton nom ni ton solde.
      </p>
      {!data && <p className="muted">Chargement…</p>}
      {data?.cases.length === 0 && <p className="muted">Aucune vente pour l'instant.</p>}
      {data?.cases.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Marchandise</th><th>Vendu à</th><th>Provenance</th><th className="num">Mérites</th><th>Cause probable</th></tr></thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id} className={c.merits === 0 ? 'row-bad' : ''}>
                  <td className="nowrap">{dateTime(c.t)}</td>
                  <td>{c.label} · {int(c.count)} t<div className="small muted">{saleValue(c.totalSale)}</div></td>
                  <td><NomSysteme nom={c.system} />{c.mode && <div className="small muted">{labelOf(MODES, c.mode)}</div>}</td>
                  <td className="small">{c.origin}</td>
                  <td className="num">
                    {int(c.merits)}
                    {c.expected != null && <div className="small muted">prévu ≈ {int(c.expected)}</div>}
                    {c.ratio && <div className="small muted">{int(c.ratio)} / M cr</div>}
                  </td>
                  <td className="small">{c.text || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.cases.length && <p className="small muted">{int(data.cases.length)} dernières sur {int(data.total)}.</p>}
    </section>
  );
}

export default function SaleTab() {
  const [forecast, setForecast] = useState(null);
  const [data, setData] = useState(null);
  const [zero, setZero] = useState(false);
  const now = useNow(15000);
  const loadCases = () => saleApi.cases(zero).then(setData).catch(() => {});
  useEffect(() => {
    saleApi.forecast().then(setForecast).catch(() => {});
  }, []);
  useEffect(() => { loadCases(); }, [zero]);
  // La liste des ventes ne change qu'à la clôture d'une vente : pas besoin de la relire à chaque mise à jour
  const saleKey = useRef(null);
  useEvent('expansion:sale', (f) => {
    setForecast(f);
    const key = `${f?.lastSale?.t}|${f?.waiting}`;
    if (key !== saleKey.current) loadCases();
    saleKey.current = key;
  });

  async function toggleWindow(e) {
    const settings = await saleApi.settings({ autoWindow: e.target.checked });
    setData((d) => d && { ...d, settings });
  }

  return (
    <>
      <section className="panel" data-tuto="extension-vente-prevision">
        <div className="form-actions">
          <h2>À quai : mérites prévus pour ta soute</h2>
          {data && (
            <label className="small" data-tuto="extension-vente-fenetre">
              <input type="checkbox" checked={data.settings.autoWindow} onChange={toggleWindow} /> fenêtre en jeu à quai
            </label>
          )}
        </div>
        <p className="small muted">
          D'après où chaque tonne a été minée ou achetée, l'état Powerplay du système, et tes propres ventes passées
          (mérites par million de crédits). Rien n'est vendu à ta place.
        </p>
        <Forecast f={forecast} now={now} />
      </section>

      {data?.ratios.length > 0 && (
        <section className="panel" data-tuto="extension-vente-ratios">
          <h2>Ratios mesurés sur tes ventes</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Sorte</th><th>Mode</th><th>Marchandise</th><th className="num">Mérites par M cr</th><th className="num">Ventes</th><th>Dernière</th></tr></thead>
              <tbody>
                {data.ratios.map((r) => (
                  <tr key={`${r.kind}|${r.mode}|${r.type}`}>
                    <td>{labelOf(KINDS, r.kind)}</td>
                    <td>{labelOf(MODES, r.mode)}</td>
                    <td>{r.label}</td>
                    <td className="num">{int(r.value)}</td>
                    <td className="num">{int(r.n)}</td>
                    <td className="nowrap">{dateTime(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Cases data={data} zero={zero} setZero={setZero} />

      {data?.rules && (
        <details className="panel small" data-tuto="extension-vente-regles">
          <summary>Règles appliquées, avec leur source</summary>
          <ul>
            {data.rules.map((r) => (
              <li key={r.id}><code>{r.id}</code> = {JSON.stringify(r.value)} · <b>{r.status}</b> ({r.date}) · {r.source}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
