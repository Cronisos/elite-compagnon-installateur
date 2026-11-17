// Garde-fou des pages et des fenêtres de l'overlay : une erreur pendant l'affichage d'UNE page (donnée imprévue venue
// de Spansh, d'Ardent ou du journal) ne démonte plus toute l'interface en page blanche. La page en cause affiche ce
// qui s'est passé ; le reste de l'app (menu, autres pages) continue, et changer d'adresse la remet à zéro.
// En JavaScript simple (sans JSX) : testé par node --test (errorBoundary.test.js).

import { Component, createElement as h } from 'react';

export const PAGE_ERROR_TEXT = "Cette page n'a pas pu s'afficher (erreur imprévue). Le reste de l'app fonctionne : change de page ou recharge-la.";

export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  /** Autre adresse : la page repart de zéro. */
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error('Page en erreur (affichage) :', error, info?.componentStack || '');
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children ?? null;
    const detail = String(error?.message || error).slice(0, 300);
    return h('div', { className: 'page-error', role: 'alert' }, h('p', null, PAGE_ERROR_TEXT), h('p', { className: 'small muted' }, detail));
  }
}
