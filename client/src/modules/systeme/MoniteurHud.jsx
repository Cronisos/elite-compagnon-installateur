// Fenêtre en jeu du moniteur PC (/hud/systeme) : une ligne par mesure, compacte, lisible d'un coup d'œil.

import { useOverlayPage } from '../../core/hud.jsx';
import { useMoniteur } from './useMoniteur.js';
import { couleurCharge, couleurTemp, couleurVram, fraction, go, ligneIa } from './moniteurVue.js';

const CSS = `
html, body { overflow: hidden !important; }
.mpc { position: relative; width: 292px; box-sizing: border-box; padding: 5px 8px 6px; display: flex; flex-direction: column; gap: 3px;
  font-family: 'Barlow Condensed', 'Segoe UI', sans-serif; color: #dfe4ea; background: linear-gradient(90deg, rgba(7,9,12,.82), rgba(7,9,12,.6));
  border-left: 2px solid var(--accent); }
.mpc.is-edit { outline: 1px dashed var(--accent); outline-offset: -1px; cursor: move; -webkit-app-region: drag; } /* toute la fenêtre se fait glisser */
.mpc-titre { display: flex; align-items: center; justify-content: space-between; color: var(--accent); font-weight: 700; font-size: 12px; letter-spacing: .18em; }
.mpc-ligne { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 6px; line-height: 1.15; }
.mpc-nom { color: #aab3bd; font-weight: 700; font-size: 11px; letter-spacing: .12em; }
.mpc-barre { height: 7px; background: rgba(255,255,255,.08); transform: skewX(-20deg); overflow: hidden; }
.mpc-barre i { display: block; height: 100%; background: var(--c); box-shadow: 0 0 5px var(--c); transition: width .5s ease; }
.mpc-val { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; min-width: 92px; }
.mpc-val b { color: #f4f6f8; }
.mpc-detail { padding-left: 40px; color: #8a94a0; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mpc-detail em { font-style: normal; color: var(--accent-clair, #ffd08a); }
.mpc-pin { position: absolute; top: 1px; right: 2px; opacity: .35; }
.mpc-pin:hover, .mpc.is-edit .mpc-pin { opacity: 1; }
`;

function Ligne({ nom, f, couleur, children }) {
  return (
    <div className="mpc-ligne">
      <span className="mpc-nom">{nom}</span>
      <span className="mpc-barre" style={{ '--c': couleur }}><i style={{ width: `${Math.round(f * 100)}%` }} /></span>
      <span className="mpc-val">{children}</span>
    </div>
  );
}

export default function MoniteurHud() {
  const { editing, pin } = useOverlayPage();
  const { m } = useMoniteur();
  const v = m?.vram;
  const ia = ligneIa(m?.ia);
  return (
    <div className={`mpc ${editing ? 'is-edit' : ''}`}>
      <style>{CSS}</style>
      <div className="mpc-titre"><span>▥ MONITEUR PC</span>{editing && <span style={{ fontWeight: 500, letterSpacing: 0, color: '#aab3bd' }}>fais glisser, puis 📌</span>}</div>
      {!m && <div className="mpc-detail">Lecture…</div>}
      {m?.gpu && (
        <Ligne nom="GPU" f={fraction(m.gpu.chargePct, 100)} couleur={couleurCharge(m.gpu.chargePct)}>
          <b>{m.gpu.chargePct ?? '—'} %</b>
          {m.gpu.tempC != null && <span style={{ color: couleurTemp(m.gpu.tempC) }}> · {Math.round(m.gpu.tempC)} °C</span>}
          {m.gpu.watts != null && ` · ${Math.round(m.gpu.watts)} W`}
        </Ligne>
      )}
      {v && (
        <>
          <Ligne nom="VRAM" f={fraction(v.utiliseeMo, v.totaleMo)} couleur={couleurVram(v.libreMo)}>
            <b>{go(v.utiliseeMo)}</b> / {go(v.totaleMo)} Go
          </Ligne>
          <div className="mpc-detail">
            libre <b style={{ color: couleurVram(v.libreMo) }}>{go(v.libreMo)}</b>
            {v.iaMo > 0 && <> · IA <em>{go(v.iaMo)}</em></>}
            {' · '}jeu + Windows {go(v.autresMo)} · pic {go(v.picMo)}
          </div>
        </>
      )}
      {m?.cpuPct != null && (
        <Ligne nom="CPU" f={fraction(m.cpuPct, 100)} couleur={couleurCharge(m.cpuPct)}><b>{Math.round(m.cpuPct)} %</b></Ligne>
      )}
      {m?.ram && (
        <Ligne nom="RAM" f={fraction(m.ram.utiliseeMo, m.ram.totaleMo)} couleur={couleurCharge((m.ram.utiliseeMo / m.ram.totaleMo) * 100)}>
          <b>{go(m.ram.utiliseeMo)}</b> / {go(m.ram.totaleMo)} Go
        </Ligne>
      )}
      {(m?.eliteMo != null || ia) && (
        <div className="mpc-detail">
          {m?.eliteMo != null && <>Elite {go(m.eliteMo)} Go de RAM</>}
          {m?.eliteMo != null && ia && ' · '}
          {ia && <>IA : <em>{ia}</em></>}
        </div>
      )}
      <span className="mpc-pin">{pin}</span>
    </div>
  );
}
