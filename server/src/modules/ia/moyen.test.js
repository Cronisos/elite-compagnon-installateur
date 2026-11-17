// Modèle intermédiaire : réparti entre la carte et le processeur sans toucher à la marge du jeu (mesures du
// 12 nov. 2026, jeu lancé : 16,5 Go libres → 26 couches sur 41 du qwen3.6 35b-a3b, ~3 s par réponse).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { choisirModele, SURCOUT_MO } from './memoire.js';
import ia from './index.js';

const GO = 1024;
const grand = { role: 'grand', nom: 'qwen3.8:27b', besoinMo: 17.4 * GO, charge: false, reparti: null };
const moyen = (o = {}) => ({ role: 'moyen', nom: 'qwen3.6:35b-a3b', besoinMo: 22.6 * GO, charge: false, reparti: { couches: 41, parCoucheMo: 526 }, ...o });
const leger = { role: 'leger', nom: 'qwen3.5:9b', besoinMo: 6.8 * GO, charge: false, reparti: null };
const choisir = (libreMo, modeles = [grand, moyen(), leger]) => choisirModele({ memoire: { libreMo, totalMo: 23028 }, modeles, margeMo: 1024, margeJeuMo: 2560 });

test('choix : hors jeu le grand ; en jeu le moyen réparti, sans toucher aux 2,5 Go du jeu ; sinon le léger', () => {
  assert.deepEqual(choisir(21000), { nom: 'qwen3.8:27b', role: 'grand' });
  // Jeu lancé, 16 484 Mo libres (mesuré) : (16 484 − 2 560 − 700) / 526 = 25 couches
  const c = choisir(16484);
  assert.equal(c.nom, 'qwen3.6:35b-a3b');
  assert.equal(c.numGpu, Math.floor((16484 - 2560 - SURCOUT_MO) / 526));
  assert.ok(c.numGpu * 526 + SURCOUT_MO <= 16484 - 2560, 'jamais dans la marge du jeu');
  // Jeu gourmand, 11 Go libres : moins de la moitié des couches tiendrait → le léger
  assert.deepEqual(choisir(11 * GO), { nom: 'qwen3.5:9b', role: 'leger' });
  // Déjà chargé avec 25 couches : on garde les mêmes (sinon Ollama recharge)
  assert.deepEqual(choisir(2900, [grand, moyen({ charge: true, numGpuCharge: 25 }), leger]), { nom: 'qwen3.6:35b-a3b', role: 'moyen', numGpu: 25 });
  // Entier s'il tient (carte de 48 Go) : toutes ses couches, imposées
  assert.deepEqual(choisirModele({ memoire: { libreMo: 40 * GO, totalMo: 48 * GO }, modeles: [moyen()], margeMo: 1024, margeJeuMo: 2560 }), { nom: 'qwen3.6:35b-a3b', role: 'moyen', numGpu: 41 });
});

test('API : en jeu, le moyen est chargé avec ses couches imposées ; un autre des nôtres est déchargé avant', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-moyen-'));
  fs.writeFileSync(path.join(dir, 'ia.json'), JSON.stringify({ actif: true })); // IA allumée (coupée par défaut)
  const f = { charges: ['qwen3.5:9b'], dechargés: [], chats: [] };
  const ollama = {
    installes: async () => [
      { nom: 'qwen3.8:27b', taille: 17 * 1024 ** 3 },
      { nom: 'qwen3.6:35b-a3b', taille: 41 * 526 * 1024 ** 2 },
      { nom: 'qwen3.5:9b', taille: 6.6 * 1024 ** 3 },
    ],
    charges: async () => f.charges.map((nom) => ({ nom, vram: 1 })),
    couches: async (nom) => (nom === 'qwen3.6:35b-a3b' ? 41 : 30),
    chat: async (o) => {
      f.chats.push({ modele: o.modele, numGpu: o.numGpu });
      if (!f.charges.includes(o.modele)) f.charges.push(o.modele);
      return { message: { role: 'assistant', content: 'Réponse.' } };
    },
    decharger: async (nom) => {
      f.dechargés.push(nom);
      f.charges = f.charges.filter((n) => n !== nom);
    },
  };
  const router = express.Router();
  await ia.register({ router, broadcast: () => {}, game: { snapshot: () => ({}) } }, {
    fichierReglages: path.join(dir, 'ia.json'),
    fichierHistorique: path.join(dir, 'ia-historique.json'),
    paroleOk: () => false, // voix de Windows : les tests ne lancent pas la voix naturelle installée sur le PC
    ollama,
    lireMemoire: async () => ({ libreMo: 16484, totalMo: 23028 }),
    fetchImpl: async (url) => (new URL(url).pathname.endsWith('/state') ? Response.json({ settings: { name: 'Nova' } }) : Response.json({ dit: true })),
  });
  const app = express();
  app.use(express.json());
  app.use('/ia', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/ia/question`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: 'Salut' }) });
    const { reponse } = await res.json();
    assert.equal(reponse.version, 'moyen');
    assert.equal(reponse.carte, Math.round((25 / 41) * 100));
    assert.deepEqual(f.chats, [{ modele: 'qwen3.6:35b-a3b', numGpu: 25 }]);
    assert.deepEqual(f.dechargés, ['qwen3.5:9b']); // jamais deux modèles sur la carte
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('chiffres sans outil lu : relancé une fois pour vérifier ; toujours rien → marqué non vérifié ; pas de chiffre → laissé', async () => {
  const { repondre, RAPPEL_OUTILS } = await import('./conversation.js');
  const lire = async () => ({ credits: { balance: 42 } });
  // 1re réponse inventée, puis l'outil, puis la vraie réponse
  const vus = [];
  const tours = [
    { message: { role: 'assistant', content: 'Tu es rang 4 avec 72 mérites.' } },
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'resume_commandant' } }] } },
    { message: { role: 'assistant', content: 'Tu as 42 cr.' } },
  ];
  const r = await repondre({ question: 'Combien ?', chat: async (m) => { vus.push(m.at(-1)); return tours.shift(); }, lire });
  assert.deepEqual(r, { texte: 'Tu as 42 cr.', appels: ['resume_commandant'] });
  assert.deepEqual(vus[1], { role: 'system', content: RAPPEL_OUTILS });
  // Têtu : deux fois sans outil → non vérifiée
  const tetu = await repondre({ question: '?', chat: async () => ({ message: { role: 'assistant', content: 'Rang 4.' } }), lire });
  assert.equal(tetu.nonVerifiee, true);
  // Pas de chiffre (question générale) : aucune relance
  let n = 0;
  const general = await repondre({ question: 'Le Powerplay ?', chat: async () => { n += 1; return { message: { role: 'assistant', content: 'Des puissances se disputent des systèmes.' } }; }, lire });
  assert.equal(n, 1);
  assert.equal(general.nonVerifiee, undefined);
});
