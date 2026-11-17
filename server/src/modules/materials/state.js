// Session de récupération de matériaux (MaterialCollected) : par catégorie, par grade, et les derniers récupérés.
// Une session commence au lancement du jeu (LoadGame) ou à une remise à zéro.

export const MATERIAL_EVENTS = ['LoadGame', 'MaterialCollected'];
export const CATEGORIES = { Raw: 'Bruts', Manufactured: 'Manufacturés', Encoded: 'Encodés' };
const RECENT = 20;

export class MaterialState {
  /** @param gradeOf nom interne → grade (1 à 5), ou null s'il est inconnu */
  constructor(gradeOf = () => null) {
    this.gradeOf = gradeOf;
    this.reset(null);
  }

  reset(startedAt) {
    this.startedAt = startedAt;
    this.byCategory = { Raw: 0, Manufactured: 0, Encoded: 0 };
    this.byGrade = [0, 0, 0, 0, 0];
    this.materials = new Map(); // nom interne → { label, category, grade, count }
    this.recent = [];
  }

  apply(ev) {
    switch (ev.event) {
      case 'LoadGame':
        this.reset(ev.timestamp);
        break;
      case 'MaterialCollected': {
        const key = String(ev.Name || '').toLowerCase();
        const count = ev.Count || 0;
        const grade = this.gradeOf(key);
        const label = ev.Name_Localised || ev.Name;
        if (ev.Category in this.byCategory) this.byCategory[ev.Category] += count;
        if (grade >= 1 && grade <= 5) this.byGrade[grade - 1] += count;
        const m = this.materials.get(key) || { label, category: ev.Category, grade, count: 0 };
        m.count += count;
        this.materials.set(key, m);
        this.recent.unshift({ at: ev.timestamp, label, category: ev.Category, grade, count });
        if (this.recent.length > RECENT) this.recent.length = RECENT;
        break;
      }
      default:
        return false;
    }
    return true;
  }

  summary() {
    return {
      startedAt: this.startedAt,
      total: this.byCategory.Raw + this.byCategory.Manufactured + this.byCategory.Encoded,
      byCategory: this.byCategory,
      byGrade: this.byGrade,
      materials: [...this.materials.values()].sort((a, b) => (b.grade || 0) - (a.grade || 0) || b.count - a.count),
      recent: this.recent,
    };
  }
}
