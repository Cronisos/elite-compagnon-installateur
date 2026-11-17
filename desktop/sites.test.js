// Sites externes de l'app de bureau : registre, navigation, requêtes bloquées vers ce PC (sites.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SITES, adresseLocale, limiteur, navigationPermise, partition, requetePermise, site, versNavigateur, zone } = require('./sites.js');

test('registre : Inara, Spansh, EDSY, Coriolis, rien d’autre ; identifiant seulement', () => {
  assert.deepEqual(Object.keys(SITES), ['inara', 'spansh', 'edsy', 'coriolis']);
  assert.equal(site('inara').accueil, 'https://inara.cz/');
  // Chaque site ne navigue que chez lui : jamais chez un autre site du registre
  for (const [id, s] of Object.entries(SITES)) {
    for (const [autre, o] of Object.entries(SITES)) assert.equal(navigationPermise(s, o.accueil), id === autre, `${id} → ${autre}`);
    assert.equal(partition(id), `persist:site-${id}`);
  }
  for (const non of ['', 'constructor', '__proto__', 'toString', null, 42, 'https://inara.cz/']) assert.equal(site(non), null, String(non));
  assert.equal(partition('inara'), 'persist:site-inara');
  for (const s of Object.values(SITES)) assert.ok(navigationPermise(s, s.accueil), s.titre);
});

test('navigation : https sur les domaines du site seulement', () => {
  const s = site('inara');
  for (const ok of ['https://inara.cz/elite/cmdr/', 'https://www.inara.cz/', 'https://INARA.cz/x']) assert.ok(navigationPermise(s, ok), ok);
  for (const non of ['http://inara.cz/', 'https://inara.cz.evil.com/', 'https://evilinara.cz/', 'https://user:pw@inara.cz/', 'http://127.0.0.1:5173/', 'file:///C:/', 'javascript:alert(1)', 'n’importe quoi']) {
    assert.equal(navigationPermise(s, non), false, non);
  }
});

test('requêtes : jamais ce PC ni le réseau local, même déguisés', () => {
  for (const loc of ['http://127.0.0.1:3001/api/state', 'http://localhost:5173/', 'http://[::1]:3001/', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://169.254.169.254/', 'http://0.0.0.0:3001/', 'ws://127.0.0.1:5173/', 'http://app.localhost/', 'http://[::ffff:127.0.0.1]/', 'file:///C:/Windows/', 'chrome://settings']) {
    assert.equal(requetePermise(loc), false, loc);
  }
  for (const ok of ['https://inara.cz/', 'https://challenges.cloudflare.com/x', 'wss://inara.cz/ws', 'https://172.15.0.1/', 'data:image/png;base64,AA', 'blob:https://inara.cz/1']) assert.ok(requetePermise(ok), ok);
  // Adresses locales en https aussi
  for (const loc of ['https://127.0.0.1:3001/', 'https://192.168.1.1/', 'wss://localhost/']) assert.equal(requetePermise(loc), false, loc);
  assert.ok(adresseLocale('192.168.0.10'));
  assert.equal(adresseLocale('8.8.8.8'), false);
  for (const nom of ['fdj.fr', 'fcbarcelona.com', 'fe80.example.com']) assert.equal(adresseLocale(nom), false, nom); // des noms, pas de l'IPv6
  for (const v6 of ['fd12:3456::1', 'fe80::1', '[fc00::5]']) assert.ok(adresseLocale(v6), v6);
  assert.equal(adresseLocale('2606:4700::6810:84e5'), false); // IPv6 publique
});

test('requêtes : jamais en clair (http, ws), ni par un nom DNS qui porte une adresse locale', () => {
  for (const non of ['http://inara.cz/', 'ws://inara.cz/ws', 'http://8.8.8.8/', 'ftp://inara.cz/']) assert.equal(requetePermise(non), false, non);
  for (const loc of ['https://192.168.1.1.nip.io/', 'https://app-10-0-0-1.sslip.io/', 'https://127.0.0.1.nip.io:3001/api/state', 'wss://192-168-0-254.sslip.io/', 'https://7f000001.nip.io/', 'https://c0a80101.nip.io/', 'https://ac100001.nip.io/', 'https://magic-ac1fffff.sslip.io/', 'https://64400001.nip.io/', 'https://0a000001.xip.io/', 'https://a9fe0101.nip.io/', 'https://172.20.0.1.nip.io/', 'https://100-64-0-1.sslip.io/', 'https://routeur.lan/', 'https://nas.home.arpa/', 'https://192.168.1.1./']) {
    assert.equal(requetePermise(loc), false, loc);
  }
  // Forme hexadécimale d'une adresse publique (8.8.8.8, 172.32.0.1, 100.128.0.1) : permise ; longueur qui n'est pas une IPv4 : pas décodée
  for (const ok of ['https://08080808.nip.io/', 'https://ac200001.nip.io/', 'https://64800001.nip.io/', 'https://7f0001.nip.io/']) assert.ok(requetePermise(ok), ok);
  for (const ok of ['https://8.8.8.8.nip.io/','https://cdn2.inara.cz/', 'https://www.google-analytics.com/g/collect', 'https://1.2.3.4/', 'https://a1-b2.example.com/']) assert.ok(requetePermise(ok), ok);
});

test('ouvertures du navigateur : au plus une toutes les 5 s', () => {
  const permis = limiteur(5000);
  assert.equal(permis(1000), true);
  assert.equal(permis(2000), false, 'boucle de window.open : refusée');
  assert.equal(permis(5999), false);
  assert.equal(permis(6000), true);
});

test('liens vers le navigateur, zone affichée', () => {
  assert.ok(versNavigateur('https://spansh.co.uk/'));
  for (const non of ['http://127.0.0.1:3001/', 'file:///C:/', 'mailto:a@b.c', 'https://a:b@x.com/']) assert.equal(versNavigateur(non), false, non);
  assert.deepEqual(zone({ x: 0, y: 80.4, width: 1200, height: 700 }, { width: 1200, height: 800 }), { x: 0, y: 80, width: 1200, height: 700 });
  for (const non of [null, { x: -1, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 10, height: 100 }, { x: 0, y: 0, width: 5000, height: 100 }, { x: 'a', y: 0, width: 100, height: 100 }]) {
    assert.equal(zone(non, { width: 1200, height: 800 }), null, JSON.stringify(non));
  }
});
