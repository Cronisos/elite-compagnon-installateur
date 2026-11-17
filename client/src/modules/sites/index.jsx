// Sites externes (sites.js) : une page du menu par site, /inara… Dans l'app de bureau, le vrai site s'y affiche.

import SitePage from './SitePage.jsx';
import { SITES } from './sites.js';

export const sitesModules = SITES.map((site) => ({
  id: `site-${site.id}`,
  title: site.titre,
  description: site.description,
  icon: site.icone,
  path: `/${site.id}`,
  Component: () => <SitePage site={site} />,
}));
