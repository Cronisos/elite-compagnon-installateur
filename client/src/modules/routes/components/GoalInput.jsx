import { compact } from '../../../core/format.js';

/** Champ de crédits : accepte « 7 000 000 000 », « 7000000000 » ou « 7 md ». */
export function parseCredits(text) {
  const s = String(text || '').toLowerCase().replace(/\s| | /g, '').replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)(md|mrd|g|m|k)?(cr)?$/.exec(s);
  if (!m) return null;
  const mult = { md: 1e9, mrd: 1e9, g: 1e9, m: 1e6, k: 1e3 }[m[2]] || 1;
  return Math.round(Number(m[1]) * mult);
}

export default function GoalInput({ value, onChange, autoFocus }) {
  const parsed = parseCredits(value);
  return (
    <span className="goal-input">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ex. 7 000 000 000 ou 7 md"
        inputMode="numeric"
        autoFocus={autoFocus}
      />
      <span className={`muted num ${value && !parsed ? 'bad' : ''}`}>
        {value ? (parsed ? `${compact(parsed)} cr` : 'montant invalide') : ''}
      </span>
    </span>
  );
}
