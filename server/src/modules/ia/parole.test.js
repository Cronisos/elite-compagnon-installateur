// Voix naturelle : nombres en lettres, texte nettoyé, argument encodé pour le programme, chemins, sons gardés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SonsRecents, aPrononcer, argumentTexte, cheminsParole, nombreEnLettres, parolePrete, synthetiser, voixNaturelle,
} from './parole.js';

test('parole : nombres en lettres, règles du français', () => {
  const cas = {
    0: 'zéro', 21: 'vingt et un', 71: 'soixante et onze', 80: 'quatre-vingts', 81: 'quatre-vingt-un', 91: 'quatre-vingt-onze',
    200: 'deux cents', 201: 'deux cent un', 1000: 'mille', 80000: 'quatre-vingt mille', 200000: 'deux cent mille',
    1000000: 'un million', 2500000: 'deux millions cinq cent mille',
  };
  for (const [n, l] of Object.entries(cas)) assert.equal(nombreEnLettres(Number(n)), l);
});

test('parole : texte à prononcer (unités du jeu, émojis, mise en forme, renvoi à la fenêtre)', () => {
  assert.equal(
    aPrononcer('**Boucliers** à 40 %, 58 t en soute, 1 234 Cr, 12,5 al, 0,05 g 🚀 (la suite dans la fenêtre principale)'),
    'Boucliers à quarante pour cent, cinquante-huit tonnes en soute, mille deux cent trente-quatre crédits, douze virgule cinq années-lumière, zéro virgule zéro cinq g',
  );
  assert.equal(aPrononcer('200k Cr, 1,2 M Cr, 3 M Cr'), 'deux cent mille crédits, un virgule deux million de crédits, trois millions de crédits');
  assert.equal(aPrononcer('1 t, 21 al, 2 sauts, 3 tient'), 'une tonne, vingt et une années-lumière, deux sauts, trois tient'); // « t » seul : une unité ; « tient » : non
  assert.equal(aPrononcer('CMDR → station'), 'commandant, station');
});

test('parole : argument en page de code 1252 qui redonne l’UTF-8 exact', () => {
  const t = 'àéèçÏœ’ Ça';
  const arg = argumentTexte(t);
  // Ce que Windows fera de l'argument : chaque caractère redevient un octet de la page 1252
  const octets = Buffer.from([...arg].map((c) => {
    const i = [...new TextDecoder('windows-1252').decode(Uint8Array.from({ length: 256 }, (_, k) => k))].indexOf(c);
    assert.ok(i >= 0, `caractère hors 1252 : ${c}`);
    return i;
  }));
  assert.equal(octets.toString('utf8'), t);
});

test('parole : voix naturelle choisie, chemins par défaut, programme présent', () => {
  assert.equal(voixNaturelle('naturelle:4'), 4);
  assert.equal(voixNaturelle('Microsoft Julie'), null);
  assert.equal(voixNaturelle('naturelle:12'), null);
  const lister = (d) => (/modeles$/.test(d) ? ['sherpa-onnx-supertonic-3-tts-int8-2026-05-11', 'autre'] : ['modeles', 'sherpa-onnx-v1.9.0-win-x64-x', 'sherpa-onnx-v2.0.1-win-x64-shared-MT-Release']);
  const c = cheminsParole({ LOCALAPPDATA: 'C:\\L' }, lister);
  assert.match(c.exe, /sherpa-onnx-v2\.0\.1-win-x64-shared-MT-Release[\\/]bin[\\/]sherpa-onnx-offline-tts\.exe$/);
  assert.match(c.modele, /modeles[\\/]sherpa-onnx-supertonic-3/);
  assert.equal(parolePrete(c, () => true), true);
  assert.equal(parolePrete(c, (f) => !/voice\.bin$/.test(f)), false);
  assert.deepEqual(cheminsParole({ LOCALAPPDATA: 'C:\\L' }, () => { throw new Error('absent'); }), { exe: null, modele: null });
});

test('parole : synthèse (programme simulé), échec si le texte arrive mal encodé', async () => {
  let vu = null;
  const executer = (exe, args, opts, cb) => {
    vu = args;
    const sortie = args.find((a) => a.startsWith('--output-filename=')).slice(18);
    fs.writeFileSync(sortie, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60)]));
    cb(null, '', '');
  };
  const wav = await synthetiser('Boucliers à 40 %', { exe: 'x.exe', modele: 'M', sid: 4, vitesse: 1.2, executer });
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.ok(vu.includes('--lang=fr') && vu.includes('--sid=4') && vu.includes('--speed=1.2') && vu.includes('--num-steps=8'));
  assert.equal(new TextEncoder().encode(vu.at(-1)).length > 0, true);
  const malEncode = (exe, args, opts, cb) => cb(null, '', 'Non UTF8 encoded string is received.');
  await assert.rejects(synthetiser('Bonjour', { exe: 'x', modele: 'M', executer: malEncode }), /mal encodé/);
  await assert.rejects(synthetiser('🚀', { exe: 'x', modele: 'M', executer }), /Rien à dire/);
});

test('parole : sons récents, cinq au plus, oubliés après 5 min', () => {
  let t = 0;
  const s = new SonsRecents({ max: 2, dureeMs: 1000, maintenant: () => t });
  const a = s.garder(Buffer.from('a'));
  const b = s.garder(Buffer.from('b'));
  const c = s.garder(Buffer.from('c'));
  assert.equal(s.lire(a), null);
  assert.equal(String(s.lire(b)), 'b');
  t = 2000;
  assert.equal(s.lire(c), null);
});

test('parole : essai de la page de l’IA, son servi une fois prêt, voix installée ou non', async () => {
  const [{ default: express }, { default: os }, { default: path }, { default: ia }] = await Promise.all([
    import('express'), import('node:os'), import('node:path'), import('./index.js'),
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-parole-'));
  let installee = true;
  const router = express.Router();
  await ia.register({ router, broadcast: () => {}, game: { snapshot: () => ({}) } }, {
    fichierReglages: path.join(dir, 'ia.json'),
    fichierHistorique: path.join(dir, 'h.json'),
    ollama: { installes: async () => [], charges: async () => [] },
    lireMemoire: async () => null,
    fetchImpl: async () => Response.json({}),
    parlerImpl: async (texte, o) => Buffer.from(`RIFF${o.sid}${texte}`),
    paroleChemins: () => ({ exe: 'x', modele: 'M' }),
    paroleOk: () => installee,
  });
  const app = express();
  app.use(express.json());
  app.use('/ia', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = (c) => `http://127.0.0.1:${server.address().port}/ia${c}`;
  const essai = (body) => fetch(url('/voix/essai'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const r = await (await essai({ texte: 'Bonjour', voixNom: 'naturelle:4' })).json();
    assert.match(r.audio, /^\/api\/modules\/ia\/voix\/s\d+$/);
    const son = await fetch(url(`/voix/${r.audio.split('/').at(-1)}`));
    assert.equal(son.headers.get('content-type'), 'audio/wav');
    assert.equal(await son.text(), 'RIFF4Bonjour');
    assert.equal((await fetch(url('/voix/s999'))).status, 404);
    assert.equal((await fetch(url('/voix/..%2Fia.json'))).status, 404);
    assert.equal((await essai({ texte: 'Bonjour', voixNom: 'Microsoft Julie' })).status, 400);
    assert.equal((await (await fetch(url('/etat'))).json()).parole.pret, true);
    installee = false;
    assert.equal((await essai({ texte: 'Bonjour', voixNom: 'naturelle:4' })).status, 503);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
