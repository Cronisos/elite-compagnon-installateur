// Langue du jeu, lue dans le Fileheader qui ouvre chaque journal (« "language":"French/FR" »).
//
// L'app est faite pour le jeu en français : la lecture d'écran (OCR) lit du français, et les noms qu'elle
// compare (minerais, marchandises, matériaux) sont ceux du jeu en français. Un jeu dans une autre langue n'est pas
// bloqué : l'app prévient seulement que ces deux points ne sont pas garantis.

import { EXPECTED_GAME_LANGUAGE } from './text.js';

/** Nom français des langues que le jeu propose (première partie de Fileheader.language). */
const LANGUAGE_NAMES = new Map([
  ['english', 'anglais'], ['french', 'français'], ['german', 'allemand'], ['spanish', 'espagnol'],
  ['russian', 'russe'], ['portuguese', 'portugais'], ['italian', 'italien'], ['polish', 'polonais'],
  ['japanese', 'japonais'], ['chinese', 'chinois'],
]);

/**
 * État de la langue du jeu : { language, french, warning, at }. Sans Fileheader connu, rien n'est affirmé
 * (french: null, pas d'avertissement).
 */
export function languageStatus(language, at = null) {
  const raw = typeof language === 'string' ? language.trim().slice(0, 40) : '';
  if (!raw) return { language: null, french: null, warning: null, at };
  const french = raw === EXPECTED_GAME_LANGUAGE;
  const name = LANGUAGE_NAMES.get(raw.split('/')[0].trim().toLowerCase());
  const which = name && name !== 'français' ? `en ${name} (${raw})` : `réglé sur « ${raw} »`;
  return {
    language: raw,
    french,
    warning: french
      ? null
      : `Ton jeu est ${which} : l'app est faite pour le jeu en français (${EXPECTED_GAME_LANGUAGE}). ` +
        "La lecture d'écran (OCR) et les noms (minerais, marchandises, matériaux) ne sont pas garantis.",
    at,
  };
}

/**
 * Suit la langue du dernier journal ouvert. `onChange(status)` est appelé quand elle change (nouveau journal
 * dans une autre langue, ou premier Fileheader lu).
 * @returns {{ current: () => object }}
 */
export function trackGameLanguage(journal, onChange = () => {}) {
  let status = languageStatus(null);
  const update = (ev) => {
    const next = ev ? languageStatus(ev.language, ev.timestamp || null) : languageStatus(null);
    const changed = next.language !== status.language;
    status = next;
    if (changed) onChange(status);
  };

  journal.addInterest(['Fileheader']);
  journal.on('ready', ({ history }) => {
    let last = null;
    for (const ev of history || []) if (ev.event === 'Fileheader') last = ev;
    update(last);
  });
  journal.on('event', (ev) => {
    if (ev.event === 'Fileheader') update(ev);
  });
  return { current: () => status };
}
