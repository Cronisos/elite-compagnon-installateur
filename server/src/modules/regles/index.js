// Module « Règles du jeu » : les règles de Powerplay, des mérites, de la colonisation et des escadrons, en français,
// avec le terme des guides anglais, le statut (mesurée, publiée, à vérifier), la date de vérification et la source.
//
// Le contenu est dans regles.json (données, pas de code) ; ce module ne fait que le lire et le servir en lecture
// seule. Les autres modules y renvoient par une simple adresse, /regles#identifiant (bouton « pourquoi ? »), ou
// lisent une règle par GET /api/modules/regles/rules/:id. Rien n'est écrit, rien n'est envoyé sur Internet.

import { loadReferential, filterRules, DATA_FILE } from './referential.js';

function notFound(raw) {
  const id = String(raw).slice(0, 80);
  const err = new Error(`Règle inconnue : ${id}`);
  err.status = 404;
  err.publicMessage = `Règle inconnue : ${id}`;
  return err;
}

export default {
  id: 'regles',
  name: 'Règles du jeu',

  /** file : autre fichier de données (tests). */
  async register({ router }, { file = DATA_FILE } = {}) {
    const ref = loadReferential(file);
    for (const e of ref.errors) console.warn(`Règles du jeu : ${e}`);
    const byId = new Map(ref.rules.map((r) => [r.id, r]));
    const { errors, ...pub } = ref;

    /** Tout le référentiel : statuts, fiches et règles. */
    router.get('/', (req, res) => res.json({ ...pub, errors: errors.length }));

    /** Règles filtrées : ?statut=mesuree,publiee&fiche=powerplay&ids=pp-portee,mv-demande */
    router.get('/rules', (req, res) => res.json(filterRules(ref, req.query)));

    /** Une règle par son identifiant stable. */
    router.get('/rules/:id', (req, res, next) => {
      const rule = byId.get(req.params.id);
      if (!rule) return next(notFound(req.params.id));
      res.json(rule);
    });
  },
};
