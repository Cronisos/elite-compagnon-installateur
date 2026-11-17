// Module « Applications externes » : menu personnel de liens vers Inara et d'autres sites,
// et liens contextuels (système, station) utilisables par les autres modules via l'API.

import { DEFAULT_LINKS, THEMES } from './defaults.js';
import { idError, requireRowId, rowId } from '../../core/ids.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const PLACEHOLDERS = ['system', 'station', 'marketId', 'systemAddress'];

/** Remplace {system}, {station}… ; null si une valeur manque. */
export function fillTemplate(url, vars) {
  let missing = false;
  const out = url.replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    if (v == null || v === '') {
      missing = true;
      return m;
    }
    return encodeURIComponent(String(v));
  });
  return missing ? null : out;
}

/** Source d'un lien ajouté par le joueur. Les liens ajoutés avant le tutoiement gardent l'ancienne en base : relue. */
export const SOURCE_JOUEUR = 'ajouté par toi';
const ANCIENNE_SOURCE = 'ajouté par vous'; // texte ancien, gardé en base : jamais affiché
export const sourceLue = (link) => (link?.source === ANCIENNE_SOURCE ? { ...link, source: SOURCE_JOUEUR } : link);

function cleanUrl(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(s)) throw bad('Adresse invalide : elle doit commencer par https://');
  return s;
}

export default {
  id: 'links',
  name: 'Applications externes',

  async register({ router, prisma, game }) {
    // Premier lancement : liens proposés
    if ((await prisma.externalLink.count()) === 0) {
      await prisma.externalLink.createMany({
        data: DEFAULT_LINKS.map((l, i) => ({ verified: true, kind: null, ...l, position: i })),
      });
    }

    router.get('/links', wrap(async (req, res) => {
      const links = await prisma.externalLink.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
      res.json({ themes: THEMES, links: links.map(sourceLue) });
    }));

    router.post('/links', wrap(async (req, res) => {
      const b = req.body || {};
      if (!String(b.label || '').trim()) throw bad('Donne un nom au lien.');
      const max = await prisma.externalLink.aggregate({ _max: { position: true } });
      const link = await prisma.externalLink.create({
        data: {
          theme: String(b.theme || 'Autres').slice(0, 40),
          label: String(b.label).trim().slice(0, 80),
          url: cleanUrl(b.url),
          kind: ['system', 'station'].includes(b.kind) ? b.kind : null,
          position: (max._max.position ?? 0) + 1,
          verified: true,
          source: SOURCE_JOUEUR,
        },
      });
      res.status(201).json(link);
    }));

    router.patch('/links/:id', wrap(async (req, res) => {
      const b = req.body || {};
      const data = {};
      if (typeof b.label === 'string' && b.label.trim()) data.label = b.label.trim().slice(0, 80);
      if (typeof b.theme === 'string' && b.theme.trim()) data.theme = b.theme.trim().slice(0, 40);
      if (b.url !== undefined) data.url = cleanUrl(b.url);
      if (typeof b.verified === 'boolean') data.verified = b.verified;
      const id = requireRowId(req.params.id, 'Lien introuvable.');
      const link = await prisma.externalLink.update({ where: { id }, data }).catch((err) => (err?.code === 'P2025' ? null : Promise.reject(err)));
      if (!link) throw idError(404, 'Lien introuvable.');
      res.json(sourceLue(link));
    }));

    router.delete('/links/:id', wrap(async (req, res) => {
      const { count } = await prisma.externalLink.deleteMany({ where: { id: requireRowId(req.params.id, 'Lien introuvable.') } });
      if (!count) throw idError(404, 'Lien introuvable.');
      res.json({ ok: true });
    }));

    /** Nouvel ordre : liste complète des identifiants. */
    router.post('/links/reorder', wrap(async (req, res) => {
      // Identifiants stricts, sans doublon : un seul invalide et rien ne bouge
      const raw = req.body?.ids;
      const ids = Array.isArray(raw) ? raw.map(rowId) : null;
      if (!ids || ids.some((id) => id == null) || new Set(ids).size !== ids.length) throw idError(400, 'Ordre invalide : liste d’identifiants de liens attendue.');
      const known = new Set((await prisma.externalLink.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((l) => l.id));
      if (known.size !== ids.length) throw idError(404, 'Lien introuvable.');
      await prisma.$transaction(ids.map((id, i) => prisma.externalLink.update({ where: { id }, data: { position: i } })));
      res.json({ ok: true });
    }));

    router.post('/links/restore-defaults', wrap(async (req, res) => {
      const existing = new Set((await prisma.externalLink.findMany({ select: { url: true } })).map((l) => l.url));
      const max = await prisma.externalLink.aggregate({ _max: { position: true } });
      const missing = DEFAULT_LINKS.filter((l) => !existing.has(l.url));
      await prisma.externalLink.createMany({
        data: missing.map((l, i) => ({ verified: true, kind: null, ...l, position: (max._max.position ?? 0) + 1 + i })),
      });
      res.json({ added: missing.length });
    }));

    /**
     * Liens contextuels résolus. Paramètres : kind (system|station) et les valeurs
     * (system, station, marketId, systemAddress). Sans valeurs : position actuelle du jeu.
     */
    router.get('/context', wrap(async (req, res) => {
      const q = req.query;
      // Textes seulement : ?kind[]=a ou ?system[x]=1 arrivent en tableau ou en objet, jamais passés tels quels à la base
      let vars = Object.fromEntries(PLACEHOLDERS.map((k) => [k, q[k]]).filter(([, v]) => typeof v === 'string' && v));
      let kinds = typeof q.kind === 'string' && q.kind ? [q.kind] : ['system', 'station'];
      if (!Object.keys(vars).length) {
        const s = game.snapshot();
        vars = { system: s.system, systemAddress: s.systemAddress, station: s.docked ? s.station : null, marketId: s.docked ? s.marketId : null };
        if (!s.docked) kinds = kinds.filter((k) => k === 'system');
      }
      const templates = await prisma.externalLink.findMany({
        where: { kind: { in: kinds }, verified: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      const links = templates
        .map((t) => ({ id: t.id, kind: t.kind, label: t.label, url: fillTemplate(t.url, vars) }))
        .filter((l) => l.url);
      res.json({ vars, links });
    }));
  },
};
