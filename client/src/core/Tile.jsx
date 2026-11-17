/** Tuile d'indicateur : libellé, grande valeur, détail. */
export default function Tile({ label, value, sub, tone }) {
  return (
    <div className={`tile ${tone ? `tile-${tone}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value num">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}
