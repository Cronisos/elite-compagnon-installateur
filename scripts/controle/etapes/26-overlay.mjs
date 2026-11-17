// Overlay : la version d'Electron reçoit-elle encore des correctifs de sécurité, les gardes de overlay/main.js
// tiennent-elles dans le VRAI Electron, et l'interface ne peut-elle pas être doublée sur son port ?
//   1. Version : calendrier officiel recopié (electron/version.mjs) ; hors suivi : échec, sauf mise à jour déclarée en
//      attente (avertissement à chaque contrôle) ; overlay/package.json et allowScripts doivent suivre la version.
//   2. Vrai Electron, vrai main.js, page de sonde (electron/essai.mjs) : permissions, requêtes, cadres, navigation,
//      rechargement, pont, fenêtre orpheline, ordres croisés. Rien n'est affiché, pris ni ouvert sur ce PC.
//   3. Vrai client/vite.config.js (electron/port.mjs) : port tenu par un autre programme refusé, écoute sur 127.0.0.1.
// Détail dans le journal de l'étape (26-overlay.log). Une quinzaine de secondes.

import fs from 'node:fs';
import { portLibre } from '../banc/serveur.mjs';
import { essayerOverlay, juger } from '../electron/essai.mjs';
import { essayerPort } from '../electron/port.mjs';
import { lireVersions, verdictElectron } from '../electron/version.mjs';

/** Date du jour, AAAA-MM-JJ (heure de ce PC). */
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default {
  titre: 'Overlay : Electron suivi, gardes dans le vrai Electron, port de l’interface',
  async lancer(ctx) {
    const journal = ctx.journal();
    const lignes = [];
    const v = verdictElectron({ ...lireVersions(ctx.racine), aujourdhui: aujourdhui() });
    lignes.push(`Version : [${v.niveau}] ${v.message}`);
    ctx.dire(v.message);
    const constats = [];
    if (v.niveau === 'echec') constats.push({ nom: 'Version d’Electron', attendu: 'suivie (correctifs de sécurité), ou mise à jour déclarée en attente', ecart: v.message });

    let essai = null;
    try {
      essai = await essayerOverlay({ racine: ctx.racine, sortie: (l) => lignes.push(`[electron] ${l}`) });
      constats.push(...juger(essai));
      ctx.dire(`Vrai Electron ${essai.rapport.version} (Chromium ${essai.rapport.chrome}) : ${essai.rapport.pages.length} message(s) de la sonde, ${essai.rapport.demandes.length} demande(s) de permission vue(s)`);
    } catch (err) {
      constats.push({ nom: 'Essai dans le vrai Electron', attendu: 'mené jusqu’au bout', ecart: err.message });
    }
    constats.push(...(await essayerPort({ racine: ctx.racine, portLibre })));

    for (const c of constats) lignes.push(`${c.ecart ? '✖' : '✔'} ${c.nom} — attendu : ${c.attendu}${c.ecart ? ` — ÉCART : ${c.ecart}` : ''}`);
    if (essai) lignes.push('', 'Rapport de l’essai :', JSON.stringify({ ...essai.rapport, interface: essai.interface, ailleurs: essai.ailleurs }, null, 2));
    fs.writeFileSync(journal, `${lignes.join('\n')}\n`);

    const ecarts = constats.filter((c) => c.ecart);
    if (ecarts.length) {
      throw new ctx.EchecEtape(`Overlay : ${ecarts.length} écart(s) sur ${constats.length} constats.`, {
        details: ecarts.map((c) => `${c.nom} : attendu ${c.attendu} ; ${c.ecart}`).join('\n'),
        journal,
      });
    }
    const resume = `${constats.length} constats conformes, Electron ${essai.rapport.version}`;
    return v.niveau === 'avertissement' ? { resume, avertissement: v.message } : `${resume} (${v.message})`;
  },
};
