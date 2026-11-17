// Personnalité de l'IA de bord : son nom (celui du Compagnon), un texte libre qui décrit son caractère et sa façon de
// répondre (donné au modèle avec sa consigne, comme une « skill »), la longueur de ses réponses, et sa voix.

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { direAVoixHaute, estNaturelle, jouerSon, voixFrancaises } from '../../core/voix.js';

export const EXEMPLE = `Tu es posée, vive et un peu malicieuse. Tu appelles le joueur « commandant ».
Tu vas droit au but : d'abord la réponse, ensuite un conseil si c'est utile.
Une pointe d'humour quand la situation s'y prête, jamais quand il est en danger.
Pas de formules de politesse à rallonge, pas d'émojis.`;

// Voix naturelles (Supertonic) : 0 à 4 femmes, 5 à 9 hommes ; hauteurs mesurées sur une même phrase (12 nov. 2026)
const NATURELLES = ['femme', 'femme, aiguë', 'femme', 'femme', 'femme, posée', 'homme', 'homme, grave', 'homme', 'homme', 'homme, grave'];

const LONGUEURS = { courte: 'Courtes (1 à 3 phrases)', normale: 'Normales (quelques phrases)', detaillee: 'Détaillées (listes permises)' };

export default function Personnalite({ ia }) {
  const r = ia.etat?.reglages;
  const [b, setB] = useState(null);
  const [voix, setVoix] = useState([]);
  const [ok, setOk] = useState(null);
  useEffect(() => {
    if (r) setB({ nom: ia.copilote?.nom || 'Alicia', personnalite: r.personnalite, longueur: r.longueur, voixNom: r.voixNom, voixVitesse: r.voixVitesse, voixHauteur: r.voixHauteur, voixVolume: r.voixVolume });
  }, [r?.personnalite, r?.longueur, r?.voixNom, r?.voixVitesse, r?.voixHauteur, r?.voixVolume, ia.copilote?.nom]);
  useEffect(() => {
    const lire = () => setVoix(voixFrancaises());
    lire();
    window.speechSynthesis?.addEventListener?.('voiceschanged', lire);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', lire);
  }, []);
  if (!b) return null;
  const champ = (cle) => ({ value: b[cle], onChange: (e) => setB({ ...b, [cle]: e.target.value }) });
  const naturelle = estNaturelle(b.voixNom);
  async function essayer() {
    const texte = `Bonjour, commandant. Ici ${b.nom}, ton IA de bord. Ta soute est vide, et le système tient bon.`;
    const reglage = { vitesse: Number(b.voixVitesse), hauteur: Number(b.voixHauteur), volume: Number(b.voixVolume) };
    if (!naturelle) return direAVoixHaute(texte, b.voixNom, reglage);
    setOk(null);
    try {
      const r = await api('/modules/ia/voix/essai', { method: 'POST', body: { texte, voixNom: b.voixNom, vitesse: reglage.vitesse } });
      jouerSon(r.audio, reglage);
    } catch (e) {
      setOk(`Voix naturelle : ${e.message}`);
    }
  }
  async function enregistrer() {
    setOk(null);
    const nom = b.nom.trim();
    // Le nom est celui du Compagnon (son avatar, sa bulle) : réglé chez lui, par son API
    if (nom && nom !== ia.copilote?.nom) await api('/modules/compagnon/settings', { method: 'PUT', body: { name: nom } }).catch((e) => setOk(`Nom non enregistré : ${e.message}`));
    await ia.regler({ personnalite: b.personnalite, longueur: b.longueur, voixNom: b.voixNom, voixVitesse: Number(b.voixVitesse), voixHauteur: Number(b.voixHauteur), voixVolume: Number(b.voixVolume) });
    setOk((o) => o || 'Enregistré ✓');
  }
  return (
    <>
      <div className="ia-regl" data-tuto="outils-ia-personnalite">
        <label>Son nom<input maxLength={24} {...champ('nom')} /></label>
        <label>Ses réponses
          <select {...champ('longueur')}>{Object.entries(LONGUEURS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label>Sa voix
          <select {...champ('voixNom')}>
            {(ia.etat?.parole?.pret || naturelle) && (
              <optgroup label="Naturelles (sur ce PC)">
                {NATURELLES.map((g, i) => <option key={i} value={`naturelle:${i}`}>Naturelle {i} ({g})</option>)}
              </optgroup>
            )}
            <optgroup label="Windows">
              <option value="">Voix française par défaut (Julie)</option>
              {voix.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </optgroup>
          </select>
          {naturelle && ia.etat?.parole && !ia.etat.parole.pret && <span className="small muted">Voix naturelle non installée : Julie la remplace.</span>}
        </label>
        <label>Vitesse de parole : {Number(b.voixVitesse).toFixed(1).replace('.', ',')}
          <input type="range" min={0.6} max={1.6} step={0.1} {...champ('voixVitesse')} />
        </label>
        {!naturelle && (
          <label>Hauteur de voix : {Number(b.voixHauteur).toFixed(1).replace('.', ',')}
            <input type="range" min={0.5} max={1.5} step={0.1} {...champ('voixHauteur')} />
          </label>
        )}
        <label>Volume : {Math.round(Number(b.voixVolume) * 100)} %
          <input type="range" min={0.05} max={1} step={0.05} {...champ('voixVolume')} />
        </label>
      </div>
      <label className="small muted" style={{ display: 'block', marginTop: '.7rem' }}>
        Sa personnalité, sa façon de parler : décris-la comme à une actrice. Ce texte lui est donné avec ses consignes à
        chaque question. Ses règles de base restent prioritaires : elle ne devine jamais un chiffre.
        <textarea rows={6} maxLength={4000} placeholder={EXEMPLE} style={{ width: '100%', marginTop: '.3rem' }} {...champ('personnalite')} />
      </label>
      <div className="form-actions" style={{ marginTop: '.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={enregistrer}>Enregistrer</button>
        <button className="btn" onClick={essayer}>▶ Essayer sa voix</button>
        {!b.personnalite && <button className="btn btn-ghost" onClick={() => setB({ ...b, personnalite: EXEMPLE })}>Partir de l’exemple</button>}
        {ok && <span className={ok.endsWith('✓') ? 'small good' : 'small bad'}>{ok}</span>}
      </div>
    </>
  );
}
