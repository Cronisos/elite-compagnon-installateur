// Préchargé dans le serveur isolé du banc (node --import) : rend ses résultats indépendants du moment et du PC.
//
//   CONTROLE_NOW     heure figée (ISO 8601, avec fuseau : 2026-11-07T14:00:00Z). Date.now() et new Date() la rendent
//                    toujours, sans avancer ; new Date(valeur), Date.parse et Date.UTC sont inchangés. Les minuteries
//                    (setTimeout, setInterval) gardent l'horloge réelle du système : elles ne dépendent pas de Date.
//   CONTROLE_ALEA    graine de Math.random (suite pseudo-aléatoire fixe : phrases du compagnon…).
//   CONTROLE_LANGUE  langue par défaut des tris et formats (Intl, localeCompare, toLocaleString) quand le code n'en
//                    donne pas : celle du PC sinon, qui change d'une machine à l'autre.
//
// Rien n'est touché si la variable correspondante est absente. Jamais chargé par l'app elle-même.

const now = process.env.CONTROLE_NOW;
if (now) {
  const fixed = Date.parse(now);
  if (!Number.isFinite(fixed) || !/(Z|[+-]\d{2}:?\d{2})$/.test(now.trim())) {
    throw new Error(`CONTROLE_NOW illisible : « ${now} » (attendu : une date ISO avec fuseau, par exemple 2026-11-07T14:00:00Z).`);
  }
  const RealDate = Date;
  const FrozenDate = new Proxy(RealDate, {
    // Date() sans new : la chaîne de l'heure figée
    apply: () => new RealDate(fixed).toString(),
    // new Date() : l'heure figée ; new Date(x) : inchangé
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [fixed], newTarget),
    get: (target, prop, receiver) => (prop === 'now' ? () => fixed : Reflect.get(target, prop, receiver)),
  });
  globalThis.Date = FrozenDate;
}

const seed = process.env.CONTROLE_ALEA;
if (seed) {
  // mulberry32, graine tirée du texte (FNV-1a) : même suite à chaque lancement
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  let a = h;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lang = process.env.CONTROLE_LANGUE;
if (lang) {
  const pick = (locales) => (locales === undefined ? lang : locales);
  for (const name of ['Collator', 'DateTimeFormat', 'NumberFormat', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'Segmenter', 'DisplayNames']) {
    const Real = Intl[name];
    if (typeof Real !== 'function') continue;
    const Wrapped = new Proxy(Real, {
      construct: (target, [locales, options], newTarget) => Reflect.construct(target, [pick(locales), options], newTarget),
      apply: (target, self, [locales, options]) => Reflect.apply(target, self, [pick(locales), options]),
    });
    Intl[name] = Wrapped;
  }
  const wrap = (proto, method) => {
    const real = proto[method];
    Object.defineProperty(proto, method, {
      value: function localized(...args) {
        const at = method === 'localeCompare' ? 1 : 0;
        if (args[at] === undefined) args[at] = lang;
        return real.apply(this, args);
      },
      writable: true,
      configurable: true,
    });
  };
  wrap(String.prototype, 'localeCompare');
  wrap(Number.prototype, 'toLocaleString');
  wrap(BigInt.prototype, 'toLocaleString');
  for (const m of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) wrap(Date.prototype, m);
  wrap(Array.prototype, 'toLocaleString');
}
