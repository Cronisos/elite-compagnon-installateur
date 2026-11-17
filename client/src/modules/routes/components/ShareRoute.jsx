import { useState } from 'react';
import { dateTime, dec1, int, compact } from '../../../core/format.js';
import { buildDiscordMessage, currentPrices } from '../shareText.js';

/**
 * Partage Discord : copie le message Markdown de la route (../shareText.js, noms neutralisés pour Discord), ou une
 * image récapitulative. Aucune donnée personnelle par défaut.
 */

/** Image récapitulative de la route (PNG) dessinée sur un canvas. */
function drawImage(view, cargo) {
  const s = view.structure;
  const prices = currentPrices(view);
  const rows = [];
  rows.push({ kind: 'station', text: `${s.startStation}`, sub: s.startSystem });
  rows.push({ kind: 'goods', text: s.start.buys.slice(0, 1).map((g) => `Achat ${g.name} · ${int(prices.get(g.commodity)?.buy ?? g.price)} cr/t`).join('') });
  s.stops.forEach((stop, k) => {
    rows.push({ kind: 'leg', text: `${s.legs[k].jumps.length} sauts · ${dec1(s.legs[k].distance)} al` });
    rows.push({ kind: 'station', text: stop.station, sub: stop.system });
    const sells = stop.sells.filter((g) => g.commodity === s.legCommodities[k]?.commodity);
    for (const g of sells) rows.push({ kind: 'goods', text: `Vente ${g.name} · ${int(prices.get(g.commodity)?.sell ?? g.price)} cr/t` });
    for (const g of stop.buys.slice(0, 1)) rows.push({ kind: 'goods', text: `Achat ${g.name} · ${int(prices.get(g.commodity)?.buy ?? g.price)} cr/t` });
  });
  const back = s.legs[s.legs.length - 1];
  rows.push({ kind: 'leg', text: `${back.jumps.length} sauts · ${dec1(back.distance)} al` });
  rows.push({ kind: 'station', text: `↺ ${s.startStation}`, sub: s.startSystem });

  const perTon = view.stats.trends.reduce((a, t) => a + ((t.lastSell ?? 0) - (t.lastBuy ?? 0)), 0);
  const W = 720;
  const H = 120 + rows.length * 30 + 90;
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.fillStyle = '#0b0d10';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ff9a3c';
  g.fillRect(0, 0, 6, H);
  g.font = '600 22px "Segoe UI", sans-serif';
  g.fillText(view.route.name, 28, 44);
  g.fillStyle = '#8a94a0';
  g.font = '13px "Segoe UI", sans-serif';
  g.fillText(`Prix du ${dateTime(view.loops[0]?.endAt || view.route.createdAt)} — les prix évoluent`, 28, 68);
  let y = 110;
  for (const r of rows) {
    if (r.kind === 'station') {
      g.fillStyle = '#e8ecf0';
      g.font = '600 16px "Segoe UI", sans-serif';
      g.fillText(r.text, 28, y);
      g.fillStyle = '#8a94a0';
      g.font = '13px "Segoe UI", sans-serif';
      const w = (g.font = '600 16px "Segoe UI", sans-serif', g.measureText(r.text).width);
      g.font = '13px "Segoe UI", sans-serif';
      g.fillText(r.sub, 28 + w + 12, y);
    } else if (r.kind === 'leg') {
      g.fillStyle = '#ff9a3c';
      g.font = '13px "Segoe UI", sans-serif';
      g.fillText(`   ↓ ${r.text}`, 28, y);
    } else {
      g.fillStyle = '#c3cad2';
      g.font = '14px "Segoe UI", sans-serif';
      g.fillText(`   ${r.text}`, 28, y);
    }
    y += 30;
  }
  y += 10;
  g.fillStyle = '#5fd38d';
  g.font = '600 18px "Segoe UI", sans-serif';
  const minutes = view.stats.avgMinutes;
  const perLoop = perTon * cargo;
  g.fillText(
    `${int(perTon)} cr/t · ${compact(perLoop)} cr par boucle (${int(cargo)} t)${minutes ? ` · ${compact((perLoop * 60) / minutes)} cr/h` : ''}`,
    28,
    y
  );
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export default function ShareRoute({ view }) {
  const [open, setOpen] = useState(false);
  const [cargo, setCargo] = useState(view.stats.cargo || 0);
  const [commander, setCommander] = useState(false);
  const [msg, setMsg] = useState('');
  const text = buildDiscordMessage({ ...view, commander: view.game.commander }, { cargo: Number(cargo) || 0, commander });

  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      flash('Message copié : colle-le dans Discord.');
    } catch {
      flash('Copie refusée par le navigateur.');
    }
  }

  async function copyImage() {
    try {
      const blob = await drawImage(view, Number(cargo) || 0);
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      flash('Image copiée.');
    } catch {
      flash("Copie d'image non prise en charge par ce navigateur.");
    }
  }

  return (
    <>
      <button className="btn" data-tuto="commerce-route-discord" onClick={() => setOpen(!open)}>Partager la route</button>
      {open && (
        <div className="share-panel panel">
          <div className="form-actions">
            <label>
              Soute pour le calcul{' '}
              <input className="input-small" value={cargo} onChange={(e) => setCargo(e.target.value)} inputMode="numeric" /> t
            </label>
            <label className="check">
              <input type="checkbox" checked={commander} onChange={(e) => setCommander(e.target.checked)} />
              Signer avec mon nom de commandant
            </label>
          </div>
          <pre className="share-preview">{text}</pre>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={copyText}>Copier le message</button>
            <button className="btn" onClick={copyImage}>Copier une image</button>
            {msg && <span className="good">{msg}</span>}
          </div>
        </div>
      )}
    </>
  );
}
