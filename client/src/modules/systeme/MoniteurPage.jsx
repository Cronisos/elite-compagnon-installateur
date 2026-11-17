// Page « Moniteur PC » (Outils) : afficher ou masquer la fenêtre en jeu, et les mêmes mesures en grand.

import { useMoniteur } from './useMoniteur.js';
import { couleurCharge, couleurTemp, couleurVram, go, ligneIa } from './moniteurVue.js';
import { texteEchec } from '../../core/actions.js';

export default function MoniteurPage() {
  const { m, reglages, regler, erreur, erreurReglage, reessayer } = useMoniteur({ lecteur: true });
  const v = m?.vram;
  const ia = ligneIa(m?.ia);
  const ligne = (titre, valeur, couleur, detail) => (
    <div className="glance-block">
      <h3>{titre}</h3>
      <div className="glance-big" style={couleur ? { color: couleur } : undefined}>{valeur}</div>
      {detail && <div className="small muted">{detail}</div>}
    </div>
  );
  return (
    <div className="page">
      <h1>Moniteur PC</h1>
      <p className="muted">
        Ce que le jeu et le copilote IA prennent à ton PC, en direct : la petite fenêtre en jeu le montre pendant que tu
        joues. Les relevés (toutes les 2 s) ne tournent que si elle est ouverte ou si cette page est affichée.
      </p>
      <div className="form-actions" style={{ flexWrap: 'wrap' }}>
        {reglages && (
          <button className={`btn ${reglages.fenetre ? '' : 'btn-primary'}`} data-tuto="outils-moniteur-fenetre" onClick={() => regler({ fenetre: !reglages.fenetre })}>
            🗔 {reglages.fenetre ? 'Masquer la fenêtre en jeu' : 'Afficher la fenêtre en jeu'}
          </button>
        )}
        <button className="btn btn-ghost" data-tuto="outils-moniteur-pic" onClick={() => regler({ repartirPic: true })} title="Le pic de mémoire vidéo repart de la valeur actuelle">↺ Pic de mémoire vidéo</button>
        {erreurReglage && <span className="small bad">{erreurReglage}</span>}
      </div>

      {!m && !erreur && <p className="muted">Lecture…</p>}
      {erreur && (
        <div className="form-actions">
          <p className="bad">{texteEchec('les mesures du PC', erreur)}</p>
          <button className="btn" onClick={reessayer}>Réessayer</button>
        </div>
      )}
      {m && (
        <div className="glance-grid" data-tuto="outils-moniteur-mesures" style={{ marginTop: '1rem' }}>
          {m.gpu ? ligne('Carte graphique', `${m.gpu.chargePct ?? '—'} %`, couleurCharge(m.gpu.chargePct), (
            <>
              {m.gpu.nom}
              {m.gpu.tempC != null && <> · <span style={{ color: couleurTemp(m.gpu.tempC) }}>{Math.round(m.gpu.tempC)} °C</span></>}
              {m.gpu.watts != null && ` · ${Math.round(m.gpu.watts)} W`}
            </>
          )) : ligne('Carte graphique', '—', null, 'Pas de carte NVIDIA lisible (nvidia-smi)')}
          {v && ligne('Mémoire vidéo', `${go(v.utiliseeMo)} / ${go(v.totaleMo)} Go`, couleurVram(v.libreMo), (
            <>
              {go(v.libreMo)} Go libres{v.iaMo > 0 && ` · IA ${go(v.iaMo)} Go`} · jeu + Windows {go(v.autresMo)} Go · pic {go(v.picMo)} Go
            </>
          ))}
          {ligne('Processeur', m.cpuPct == null ? '—' : `${Math.round(m.cpuPct)} %`, couleurCharge(m.cpuPct), 'tous les cœurs')}
          {m.ram && ligne('Mémoire', `${go(m.ram.utiliseeMo)} / ${go(m.ram.totaleMo)} Go`, couleurCharge((m.ram.utiliseeMo / m.ram.totaleMo) * 100), m.eliteMo != null ? `dont Elite ${go(m.eliteMo)} Go` : 'Elite ne tourne pas')}
          {ia && ligne('IA de bord', m.ia.length ? 'chargé' : 'au repos', null, ia)}
        </div>
      )}
      <p className="tiny muted" data-tuto="outils-moniteur-couleurs" style={{ marginTop: '1rem' }}>
        Le pilote NVIDIA ne détaille pas la mémoire vidéo par programme : « jeu + Windows » est ce qui reste une fois
        retiré ce que prend l’IA (Ollama). Couleurs de la mémoire vidéo : ambre sous 3 Go libres, rouge sous 1 Go (l’IA
        de bord se décharge alors d’elle-même).
      </p>
    </div>
  );
}
