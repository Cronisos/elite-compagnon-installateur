// Tests du copilote IA : mémoire vidéo et choix du modèle, outils, conversation, bulle, réglages, et l'API complète
// avec un faux Ollama (aucun modèle chargé pour de vrai).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { aDecharger, besoinMo, choisirModele, lireNvidiaSmi, memoireVideo } from './memoire.js';
import { executer, OUTILS, definitions, MAX_RESULTAT } from './outils.js';
import { pourLaBulle, repondre, MAX_BULLE } from './conversation.js';
import { nettoyerReglages, REGLAGES_DEFAUT } from './reglages.js';
import ia from './index.js';

const GO = 1024;
const modeles = (chargeGrand = false) => [
  { role: 'grand', nom: 'qwen3.8:27b', besoinMo: 17.4 * GO, charge: chargeGrand },
  { role: 'leger', nom: 'qwen3.5:9b', besoinMo: 6.1 * GO, charge: false },
];

test('nvidia-smi : mémoire libre et totale de la première carte', () => {
  assert.deepEqual(lireNvidiaSmi('20263, 23028\r\n'), { libreMo: 20263, totalMo: 23028 });
  assert.deepEqual(lireNvidiaSmi('\n 1200 , 8192\n 500, 4096'), { libreMo: 1200, totalMo: 8192 });
  for (const mauvais of ['', 'No devices were found', '[N/A], 8192', '9000, 8192', null]) assert.equal(lireNvidiaSmi(mauvais), null, String(mauvais));
});

test('mémoire vidéo : pas de nvidia-smi (pas de carte NVIDIA) → inconnue, sans exception', async () => {
  assert.equal(await memoireVideo({ executer: (cmd, args, opts, cb) => cb(new Error('ENOENT')) }), null);
  assert.equal(await memoireVideo({ executer: () => { throw new Error('ENOENT'); } }), null);
  assert.deepEqual(await memoireVideo({ executer: (cmd, args, opts, cb) => cb(null, '20000, 23028\n') }), { libreMo: 20000, totalMo: 23028 });
});

test('choix du modèle : le grand s’il tient avec la marge, sinon le léger, sinon aucun ; le jeu passe d’abord', () => {
  const marge = 1024;
  assert.equal(besoinMo(17 * 1024 ** 3), 17 * GO + 700);
  // Jeu au menu : 20 Go libres
  assert.deepEqual(choisirModele({ memoire: { libreMo: 20 * GO, totalMo: 23 * GO }, modeles: modeles(), margeMo: marge }), { nom: 'qwen3.8:27b', role: 'grand' });
  // Jeu en vol gourmand : 12 Go libres → le léger
  assert.deepEqual(choisirModele({ memoire: { libreMo: 12 * GO, totalMo: 23 * GO }, modeles: modeles(), margeMo: marge }), { nom: 'qwen3.5:9b', role: 'leger' });
  // Grand déjà chargé : il reste 2 Go libres, c'est assez pour la marge
  assert.deepEqual(choisirModele({ memoire: { libreMo: 2 * GO, totalMo: 23 * GO }, modeles: modeles(true), margeMo: marge }), { nom: 'qwen3.8:27b', role: 'grand' });
  // Presque plein : aucun
  const plein = choisirModele({ memoire: { libreMo: 5 * GO, totalMo: 23 * GO }, modeles: modeles(), margeMo: marge });
  assert.equal(plein.nom, null);
  assert.match(plein.raison, /le jeu passe d’abord/);
  // Pas de carte NVIDIA : le léger seulement
  assert.deepEqual(choisirModele({ memoire: null, modeles: modeles(), margeMo: marge }), { nom: 'qwen3.5:9b', role: 'leger' });
  assert.equal(choisirModele({ memoire: null, modeles: modeles().slice(0, 1), margeMo: marge }).nom, null);
  assert.equal(choisirModele({ memoire: { libreMo: 20 * GO }, modeles: [], margeMo: marge }).nom, null);
  // Déchargement : sous la marge seulement, et jamais sur une mémoire inconnue
  assert.equal(aDecharger({ libreMo: 900 }, marge), true);
  assert.equal(aDecharger({ libreMo: 1100 }, marge), false);
  assert.equal(aDecharger(null, marge), false);
});

test('outils : chaque description dit ce qu’il lit ; résultat coupé s’il est long ; erreur lisible', async () => {
  assert.ok(OUTILS.length >= 8);
  assert.equal(new Set(OUTILS.map((o) => o.nom)).size, OUTILS.length);
  for (const d of definitions()) assert.match(d.function.name, /^[a-z_]+$/);
  assert.match(OUTILS.find((o) => o.nom === 'vaisseau_actuel').description, /Pour le SRV ou la combinaison : etat_direct/);
  assert.match(OUTILS.find((o) => o.nom === 'etat_direct').description, /celui du SRV quand il est dans le SRV/);
  const lire = async (chemin) => (chemin === '/api/modules/builder/fleet' ? Array.from({ length: 2000 }, (_, i) => ({ i })) : null);
  const long = await executer('flotte', lire);
  assert.equal(long.length, MAX_RESULTAT + '… (coupé)'.length);
  assert.match(await executer('inconnu', lire), /Outil inconnu/);
  assert.match(await executer('flotte', async () => { throw new Error('404'); }), /Lecture impossible \(404\)/);
  // Le vaisseau : l'équipement et l'état, pas toute la réponse de /api/state
  const lireEtat = async (chemin) => (chemin === '/api/state'
    ? { game: { ship: 'Panther Clipper Mk II', loadout: { fuelCapacity: 64 }, docked: true, station: 'X', cargo: [{ name: 'or', count: 3 }] }, journal: { dir: 'C:\\secret' } }
    : { vaisseau: { coque: 92 }, kills: 3 });
  const v = JSON.parse(await executer('vaisseau_actuel', lireEtat));
  assert.deepEqual(v, { vaisseau: 'Panther Clipper Mk II', equipement: { fuelCapacity: 64 }, a_quai: true, station: 'X', etat: { coque: 92 } });
  assert.deepEqual(JSON.parse(await executer('combat_session', lireEtat)), { kills: 3 });
});

test('conversation : le modèle appelle un outil, puis répond ; l’historique lui est redonné', async () => {
  const vus = [];
  const tours = [
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'resume_commandant', arguments: {} } }] } },
    { message: { role: 'assistant', content: 'Tu as 865 693 782 cr.' } },
  ];
  const chat = async (messages, tools) => {
    vus.push(messages.map((m) => m.role));
    assert.ok(tools.length >= 8);
    return tours.shift();
  };
  const r = await repondre({
    question: 'Combien j’ai ?',
    historique: [{ role: 'user', texte: 'Salut' }, { role: 'assistant', texte: 'Salut !' }],
    chat,
    lire: async () => ({ credits: { balance: 865693782 } }),
    nom: 'Nova',
    cmdr: 'Testeur',
  });
  assert.deepEqual(r, { texte: 'Tu as 865 693 782 cr.', appels: ['resume_commandant'] });
  assert.deepEqual(vus[0], ['system', 'user', 'assistant', 'user']);
  assert.deepEqual(vus[1], ['system', 'user', 'assistant', 'user', 'assistant', 'tool']);
});

test('conversation : un modèle qui appelle des outils sans fin finit par rendre la main', async () => {
  const chat = async () => ({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'flotte' } }] } });
  const r = await repondre({ question: '?', chat, lire: async () => [] });
  assert.match(r.texte, /tourne en rond/);
  assert.equal(r.appels.length, 6);
});

test('bulle : sans mise en forme, coupée à la fin d’une phrase, avec un renvoi à la fenêtre principale', () => {
  assert.equal(pourLaBulle('Tu as **11 vaisseaux** :\n- Anaconda\n- Mandalay'), 'Tu as 11 vaisseaux : Anaconda Mandalay');
  const long = `${'Première phrase assez longue pour remplir la bulle. '.repeat(10)}Fin.`;
  const b = pourLaBulle(long);
  assert.ok(b.length <= MAX_BULLE, String(b.length));
  assert.match(b, /bulle\. \(la suite dans la fenêtre principale\)$/);
  assert.match(pourLaBulle('x'.repeat(400)), /x…\s?\(la suite/);
});

test('réglages : valeurs valides gardées, le reste refusé avec une explication', () => {
  assert.deepEqual(nettoyerReglages({}).reglages, REGLAGES_DEFAUT);
  const { reglages, erreurs } = nettoyerReglages({ grand: 'qwen3.6:27b', margeMo: 2048, actif: false });
  assert.deepEqual(erreurs, []);
  assert.equal(reglages.grand, 'qwen3.6:27b');
  assert.equal(reglages.margeMo, 2048);
  assert.equal(reglages.actif, false);
  const mauvais = nettoyerReglages({ grand: 'rm -rf /', margeMo: 10, garderSec: 1.5, actif: 'oui' });
  assert.equal(mauvais.erreurs.length, 4);
  assert.equal(mauvais.reglages.grand, REGLAGES_DEFAUT.grand);
});

// --- API complète, faux Ollama ---

function fauxOllama({ installes = [{ nom: 'qwen3.8:27b', taille: 17 * 1024 ** 3 }, { nom: 'qwen3.5:9b', taille: 6.6 * 1024 ** 3 }], reponses = [] } = {}) {
  const f = { charges: [], dechargés: [], chats: [] };
  f.client = {
    installes: async () => installes,
    charges: async () => f.charges.map((nom) => ({ nom, vram: 1 })),
    chat: async (o) => {
      f.chats.push(o.modele);
      if (!f.charges.includes(o.modele)) f.charges.push(o.modele);
      return reponses.shift() || { message: { role: 'assistant', content: 'Réponse.' } };
    },
    decharger: async (nom) => {
      f.dechargés.push(nom);
      f.charges = f.charges.filter((n) => n !== nom);
    },
  };
  return f;
}

async function monter({ ollama, memoire = { libreMo: 20 * GO, totalMo: 23 * GO }, parole = false, neuve = false }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  // IA allumée par le joueur (coupée par défaut) ; `neuve` : première installation, sans réglage enregistré
  if (!neuve) fs.writeFileSync(path.join(dir, 'ia.json'), JSON.stringify({ actif: true }));
  const router = express.Router();
  const diffuse = [];
  const dits = [];
  // Faux reste de l'app : le Compagnon (bulle) et un module lu par les outils
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    if (u.pathname === '/api/modules/compagnon/dire') {
      dits.push(JSON.parse(opts.body));
      return new Response('{"dit":true}', { status: 200 });
    }
    if (u.pathname === '/api/modules/compagnon/state') return Response.json({ settings: { name: 'Nova' } });
    if (u.pathname === '/api/modules/glance/summary') return Response.json({ credits: { balance: 42 } });
    return new Response('null', { status: 404 });
  };
  const etat = { memoire };
  await ia.register({ router, broadcast: (t, d) => diffuse.push([t, d]), game: { snapshot: () => ({ commander: 'Testeur' }) } }, {
    fichierReglages: path.join(dir, 'ia.json'),
    fichierHistorique: path.join(dir, 'ia-historique.json'),
    // Voix de Windows : les tests ne lancent pas la voix naturelle installée sur le PC ; `parole` : une voix simulée
    paroleOk: () => parole,
    paroleChemins: () => ({ exe: 'x', modele: 'M' }),
    parlerImpl: async (texte, o) => Buffer.from(`RIFF${o.sid}`),
    ollama: ollama.client,
    lireMemoire: async () => etat.memoire,
    fetchImpl,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/modules/ia', router);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/modules/ia`;
  const appel = async (chemin, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(base + chemin, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  return { appel, diffuse, dits, etat, dir, fermer: () => new Promise((r) => server.close(r)) };
}

test('API : une question → outil, réponse, historique enregistré, bulle du Copilote', async () => {
  const ollama = fauxOllama({ reponses: [
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'resume_commandant' } }] } },
    { message: { role: 'assistant', content: 'Tu as **42 cr**.' } },
  ] });
  const t = await monter({ ollama });
  try {
    const { status, data } = await t.appel('/question', { texte: 'Combien j’ai ?' });
    assert.equal(status, 200);
    assert.equal(data.reponse.texte, 'Tu as **42 cr**.');
    assert.equal(data.reponse.modele, 'qwen3.8:27b');
    assert.equal(data.reponse.leger, false);
    assert.deepEqual(data.reponse.outils, ['resume_commandant']);
    assert.deepEqual(t.dits.map((d) => d.texte), ['Je regarde ça…', 'Tu as 42 cr.']);
    assert.equal(t.dits[0].source, 'ia');
    const historique = JSON.parse(fs.readFileSync(path.join(t.dir, 'ia-historique.json'), 'utf8'));
    assert.deepEqual(historique.map((m) => m.role), ['user', 'assistant']);
    assert.deepEqual((await t.appel('/historique')).data.map((m) => m.texte), ['Combien j’ai ?', 'Tu as **42 cr**.']);
    assert.ok(t.diffuse.some(([type]) => type === 'ia:message'));
    // Question vide ou trop longue
    assert.equal((await t.appel('/question', { texte: '  ' })).status, 400);
    assert.equal((await t.appel('/question', { texte: 'x'.repeat(1001) })).status, 400);
    // Oubli
    await t.appel('/oublier', {});
    assert.deepEqual((await t.appel('/historique')).data, []);
  } finally {
    await t.fermer();
  }
});

test('API : jeu gourmand → le léger, mention dans la réponse ; mémoire pleine → pas de réponse, explication', async () => {
  const ollama = fauxOllama();
  const t = await monter({ ollama, memoire: { libreMo: 12 * GO, totalMo: 23 * GO } });
  try {
    const r1 = (await t.appel('/question', { texte: 'Salut' })).data.reponse;
    assert.equal(r1.modele, 'qwen3.5:9b');
    assert.equal(r1.leger, true);
    ollama.charges = []; // déchargé entre-temps
    t.etat.memoire = { libreMo: 600, totalMo: 23 * GO };
    const r2 = (await t.appel('/question', { texte: 'Et là ?' })).data.reponse;
    assert.equal(r2.erreur, true);
    assert.match(r2.texte, /le jeu passe d’abord/);
    assert.deepEqual(ollama.chats, ['qwen3.5:9b']);
    assert.equal(t.dits.at(-1).humeur, 'inquiet');
  } finally {
    await t.fermer();
  }
});

test('API : Ollama absent → message clair ; coupé dans les réglages → refus ; réglages invalides → 400', async () => {
  const ollama = fauxOllama();
  ollama.client.installes = async () => { throw new Error('ECONNREFUSED'); };
  const t = await monter({ ollama });
  try {
    const r = await t.appel('/question', { texte: 'Salut' });
    assert.equal(r.status, 503);
    assert.match(r.data.reponse.texte, /Ollama ne répond pas/);
    const e = (await t.appel('/etat')).data;
    assert.match(e.ollamaErreur, /Ollama ne répond pas/);
    assert.equal((await t.appel('/reglages', { margeMo: 5 }, 'PUT')).status, 400);
    assert.equal((await t.appel('/reglages', { actif: false }, 'PUT')).data.actif, false);
    assert.equal((await t.appel('/question', { texte: 'Salut' })).status, 409);
    assert.equal(JSON.parse(fs.readFileSync(path.join(t.dir, 'ia.json'), 'utf8')).actif, false);
  } finally {
    await t.fermer();
  }
});

test('API : première installation → IA coupée, rien n’est demandé à Ollama tant que le joueur ne l’allume pas', async () => {
  assert.equal(REGLAGES_DEFAUT.actif, false);
  const ollama = fauxOllama();
  const appels = [];
  for (const k of ['installes', 'charges', 'chat']) {
    const f = ollama.client[k];
    ollama.client[k] = (...a) => { appels.push(k); return f(...a); };
  }
  ollama.client.installes = async () => { appels.push('installes'); throw new Error('ECONNREFUSED'); }; // membre sans Ollama
  const t = await monter({ ollama, neuve: true });
  try {
    const e = (await t.appel('/etat')).data;
    assert.equal(e.reglages.actif, false);
    assert.equal(e.ollamaErreur, null, 'pas d’erreur Ollama affichée à qui ne s’en sert pas');
    assert.equal(e.modeles, null);
    assert.equal((await t.appel('/question', { texte: 'Salut' })).status, 409);
    assert.deepEqual(ollama.charges, [], 'aucun modèle chargé');
    assert.deepEqual(appels, [], 'Ollama n’est pas interrogé du tout');
    ollama.client.installes = async () => [{ nom: 'qwen3.8:27b', taille: 17 * 1024 ** 3 }, { nom: 'qwen3.5:9b', taille: 6.6 * 1024 ** 3 }];
    assert.equal((await t.appel('/reglages', { actif: true }, 'PUT')).data.actif, true);
    assert.equal((await t.appel('/question', { texte: 'Salut' })).status, 200);
  } finally {
    await t.fermer();
  }
});

test('API : décharger rend la mémoire vidéo tout de suite', async () => {
  const ollama = fauxOllama();
  const t = await monter({ ollama });
  try {
    await t.appel('/question', { texte: 'Salut' });
    assert.deepEqual(ollama.charges, ['qwen3.8:27b']);
    assert.deepEqual((await t.appel('/decharger', {})).data, { decharges: ['qwen3.8:27b'] });
    assert.deepEqual(ollama.charges, []);
  } finally {
    await t.fermer();
  }
});

test('API : voix naturelle → la bulle part avec son son ; sans elle, voix de Windows par défaut', async () => {
  const reponses = () => [{ message: { role: 'assistant', content: 'Boucliers à 40 %.' } }];
  for (const parole of [true, false]) {
    const t = await monter({ ollama: fauxOllama({ reponses: reponses() }), parole });
    try {
      assert.equal((await t.appel('/question', { texte: 'Mes boucliers ?' })).status, 200);
      const d = t.dits.at(-1);
      assert.equal(d.parler, true);
      assert.equal(d.voix, null); // « naturelle:4 » n'est pas un nom de voix de Windows
      if (parole) assert.match(d.audio, /^\/api\/modules\/ia\/voix\/s\d+$/);
      else assert.equal(d.audio, undefined);
    } finally {
      await t.fermer();
    }
  }
});
