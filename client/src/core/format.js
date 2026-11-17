// Mise en forme française des nombres, durées et dates.

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ok = (n) => n != null && Number.isFinite(Number(n));

export const int = (n) => (ok(n) ? nf.format(Math.round(n)) : '—');
export const dec1 = (n) => (ok(n) ? nf1.format(n) : '—');
export const dec2 = (n) => (ok(n) ? nf2.format(n) : '—');
export const cr = (n) => (ok(n) ? `${int(n)} cr` : '—');

/** 3 744 458 253 → « 3,74 Md » ; 74 591 507 → « 74,6 M » */
export function compact(n) {
  if (!ok(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${nf2.format(n / 1e9)} Md`;
  if (a >= 1e6) return `${nf1.format(n / 1e6)} M`;
  if (a >= 1e4) return `${nf.format(n / 1e3)} k`;
  return int(n);
}

export const pct = (x) => (ok(x) ? `${nf1.format(x * 100)} %` : '—');

/** Durée en secondes → « 14,0 min » ou « 3 h 05 » */
export function duration(sec) {
  if (!ok(sec)) return '—';
  if (sec < 3600) return `${nf1.format(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Chronomètre : 754 s → « 12:34 » */
export function clock(sec) {
  if (!ok(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export const time = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

export const date = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';

export const dateTime = (iso) => (iso ? `${date(iso)} ${time(iso)}` : '—');

/** « il y a 3 h » */
export function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
