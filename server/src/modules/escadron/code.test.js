// Codes de l'escadron et de gestion : même format que le plugin EDMC (load.py, parse_code).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeEscadron, codeGestion, lireCodeEscadron, lireCodeGestion } from './code.js';

test('code de l\'escadron : aller-retour, mot de passe seul, illisible', () => {
  const code = codeEscadron('https://squadron-tracker-api.test.workers.dev', 'mot de passe à é');
  assert.match(code, /^ESC1\.[\w-]+$/);
  assert.deepEqual(lireCodeEscadron(` ${code} `), { serveur: 'https://squadron-tracker-api.test.workers.dev', motDePasse: 'mot de passe à é' });
  assert.deepEqual(lireCodeEscadron('juste un mot de passe'), { serveur: null, motDePasse: 'juste un mot de passe' });
  for (const bad of ['', '   ', 'ESC1.%%%', 'ESC1.' + Buffer.from('[1]').toString('base64url'), 'ESC1.' + Buffer.from('{"u":"x"}').toString('base64url'), 42, null]) {
    assert.equal(lireCodeEscadron(bad), null, String(bad));
  }
});

test('code de l\'escadron : décodé comme le plugin Python (base64url sans « = », JSON { u, p })', () => {
  const code = codeEscadron('https://a.workers.dev', 'p');
  const json = JSON.parse(Buffer.from(code.slice(5), 'base64url').toString());
  assert.deepEqual(json, { u: 'https://a.workers.dev', p: 'p' });
  assert.ok(!code.includes('='));
});

test('code de gestion : aller-retour, champs facultatifs', () => {
  const g = { url: 'https://a.workers.dev', adminToken: 'a'.repeat(43), trackerToken: 't'.repeat(43), motDePasse: 'mot de passe' };
  assert.deepEqual(lireCodeGestion(codeGestion(g)), g);
  assert.deepEqual(lireCodeGestion(codeGestion({ url: g.url, adminToken: g.adminToken })), { ...g, trackerToken: null, motDePasse: null });
  assert.equal(lireCodeGestion(codeEscadron(g.url, 'x')), null, 'un code d’escadron n’est pas un code de gestion');
  assert.equal(lireCodeGestion('EGC1.xx'), null);
});
