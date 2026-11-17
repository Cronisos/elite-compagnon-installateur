// Statistiques d'un build : bandeau de chiffres clés au-dessus de l'éditeur, puis le détail par thème (boucliers,
// coque, armement, énergie, distributeur, saut, mobilité, masse, prix).

import { compact, dec1, dec2, int } from '../../../core/format.js';

const TYPES = { kin: 'Cinétique', thm: 'Thermique', exp: 'Explosif', abs: 'Absolu', cau: 'Caustique', axe: 'Anti-xéno' };
const TYPE_COLORS = { kin: '#d3a6ff', thm: 'var(--accent)', exp: '#ff6f91', abs: '#ffd24a', cau: '#5fd38d', axe: '#6fd3ff' };
const pctRes = (v) => `${int(v)} %`;
const secs = (s) => (s == null ? '—' : s < 60 ? `${dec1(s)} s` : `${Math.floor(s / 60)} min ${int(s % 60)} s`);

/** Ligne libellé / valeur ; tone : good, warn, bad. */
function Row({ label, value, tone, hint }) {
  return (
    <tr title={hint}>
      <td className="muted">{label}</td>
      <td className={`right num ${tone || ''}`}>{value}</td>
    </tr>
  );
}

function Card({ title, children, wide, full }) {
  return (
    <section className={`panel builder-card ${wide ? 'builder-card-wide' : ''} ${full ? 'builder-card-full' : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * Défense façon EDSY : pour chaque type de dégât, résistance et points effectifs des boucliers, des boucliers avec
 * toutes les cellules, de la coque, et le total à encaisser avant destruction.
 */
function Defense({ s }) {
  const sh = s.shield;
  const rows = [['abs', 'Absolu (brut)'], ['kin', 'Cinétique'], ['thm', 'Thermique'], ['exp', 'Explosif']];
  // Absolu : bouclier divisé par la part des pips SYS (eff.abs) ; coque : brute
  const pick = (eff, raw, k) => eff?.[k] ?? raw;
  const res = (r, k) => (k === 'abs' || !r ? '—' : pctRes(r[k]));
  return (
    <table className="table compact builder-defense">
      <thead>
        <tr>
          <th>Dégâts</th>
          <th className="right">Résist. boucliers</th>
          <th className="right">Boucliers</th>
          {sh?.cells.length > 0 && <th className="right" title="Boucliers plus toutes les cellules (EDSY affiche les cellules seules)">Boucliers + cellules</th>}
          <th className="right">Résist. coque</th>
          <th className="right">Coque</th>
          <th className="right">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, label]) => {
          const shield = sh ? pick(sh.effective, s.shields, k) : 0;
          const withCells = sh ? pick(sh.withCellsEffective, sh.withCells, k) : 0;
          const hull = pick(s.hull.effective, s.armour, k);
          return (
            <tr key={k}>
              <td className="muted">{label}</td>
              <td className={`right num ${s.shieldRes?.[k] < 0 ? 'bad' : ''}`}>{res(s.shieldRes, k)}</td>
              <td className="right num">{int(shield)}</td>
              {sh?.cells.length > 0 && <td className="right num">{int(withCells)}</td>}
              <td className={`right num ${s.armourRes?.[k] < 0 ? 'bad' : ''}`}>{res(s.armourRes, k)}</td>
              <td className="right num">{int(hull)}</td>
              <td className="right num"><strong>{int((sh?.cells.length ? withCells : shield) + hull)}</strong></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Barre de répartition des dégâts par type. */
function DamageBar({ byType, total }) {
  const parts = Object.entries(byType).filter(([, v]) => v > 0);
  if (!total || !parts.length) return null;
  return (
    <>
      <div className="builder-dmgbar">
        {parts.map(([k, v]) => <span key={k} style={{ width: `${(v / total) * 100}%`, background: TYPE_COLORS[k] }} title={`${TYPES[k]} : ${dec1(v)} DPS`} />)}
      </div>
      <div className="builder-dmglegend small">
        {parts.map(([k, v]) => <span key={k}><i style={{ background: TYPE_COLORS[k] }} />{TYPES[k]} {int((v / total) * 100)} %</span>)}
      </div>
    </>
  );
}

/** Chiffres clés, en bandeau au-dessus de l'éditeur. */
export function StatsSummary({ result }) {
  if (!result) return <p className="muted small">Calcul…</p>;
  const s = result.stats;
  const powerPct = s.power.capacity ? s.power.deployed / s.power.capacity : 0;
  const tiles = [
    ['Saut', `${dec2(s.jump.max)} al`, `plein : ${dec2(s.jump.unladen)} · soute pleine : ${dec2(s.jump.laden)}`],
    ['Boucliers', s.shields ? `${int(s.shields)} MJ` : 'aucun', s.shieldRes ? `${int(s.shieldRes.kin)} / ${int(s.shieldRes.thm)} / ${int(s.shieldRes.exp)} %` : '', s.shields ? '' : 'warn'],
    ['Coque', int(s.armour), s.armourRes ? `${int(s.armourRes.kin)} / ${int(s.armourRes.thm)} / ${int(s.armourRes.exp)} %` : ''],
    ['DPS', dec1(s.dps), s.armament ? `rafale ${dec1(s.armament.burst)}` : ''],
    ['Vitesse', `${int(s.speed)} m/s`, s.boost ? `boost ${int(s.boost)} m/s` : 'boost impossible', s.boost ? '' : 'warn'],
    ['Énergie', `${dec2(s.power.deployed)} MW`, `sur ${dec2(s.power.capacity)} MW · ${int(powerPct * 100)} %`, powerPct > 1 ? 'bad' : powerPct > 0.9 ? 'warn' : ''],
    ['Soute', `${int(s.cargo)} t`, s.cabins ? `${int(s.cabins)} passagers` : `réservoir ${int(s.fuel)} t`],
    ['Masse', `${int(s.mass.unladen)} t`, `chargée ${int(s.mass.laden)} t`],
    ['Prix', s.cost ? compact(s.cost.total) : '—', s.cost ? `rachat ${compact(s.cost.rebuy)}` : ''],
  ];
  return (
    <div className="builder-summary">
      {result.warnings.map((w) => <div key={w} className="alert alert-warning">{w}</div>)}
      <div className="builder-summary-tiles">
        {tiles.map(([label, value, sub, tone]) => (
          <div key={label} className={`builder-kpi ${tone || ''}`}>
            <span className="builder-kpi-label">{label}</span>
            <strong className="builder-kpi-value">{value}</strong>
            <span className="builder-kpi-sub">{sub}</span>
          </div>
        ))}
      </div>
      <div className="progress small-progress" title="Énergie, armes sorties">
        <div className={`progress-bar ${powerPct > 1 ? 'bar-bad' : ''}`} style={{ width: `${Math.min(100, Math.round(powerPct * 100))}%` }} />
      </div>
    </div>
  );
}

/**
 * Détail des statistiques, par thème.
 * @param slotLabel (i) => libellé du point d'emport i, et weaponLabel (i) => nom de l'arme qui y est montée
 */
export function StatsDetails({ result, slotLabel, weaponLabel }) {
  if (!result) return null;
  const s = result.stats;
  const a = s.armament;
  const sh = s.shield;
  const powerLeft = s.power.capacity - s.power.deployed;
  return (
    <div className="builder-cards" data-tuto="builds-details">
      <Card title="Défense" wide>
        <Defense s={s} />
        <p className="tiny muted">Points à encaisser avant de perdre les boucliers, puis la coque, selon le type de dégâts. Boucliers avec {sh ? `${String(sh.pips).replace('.', ',')} pip${sh.pips > 1 ? 's' : ''} SYS (−${int(sh.pipResistance * 100)} % de dégâts)` : 'les pips SYS'}, comme EDSY. « Boucliers + cellules » : toutes les cellules de bouclier utilisées.</p>
      </Card>

      <Card title="Boucliers">
        {sh ? (
          <table className="table compact">
            <tbody>
              <Row label="Force" value={`${int(s.shields)} MJ`} />
              <Row label="Base du vaisseau" value={`${int(sh.base)} MJ`} />
              <Row label="Boosters" value={int(sh.boosters)} />
              <Row label="Recharge" value={`${dec2(sh.regenEffective)} MJ/s`} hint={sh.regenEffective < sh.regen ? `Générateur : ${dec2(sh.regen)} MJ/s, bridé par le condensateur SYS du distributeur à ${String(sh.pips).replace('.', ',')} pips` : undefined} />
              <Row label="Après effondrement" value={`${dec2(sh.brokenRegen)} MJ/s`} />
              <Row label="Retour à 50 %" value={secs(sh.rebuild)} hint="Après effondrement : 16 s d'attente, puis la reconstruction (bridée par le distributeur)" />
              <Row label="De 50 à 100 %" value={secs(sh.fromHalf)} />
              <Row label="De 0 à 100 %" value={secs(sh.full)} />
              {sh.cells.map((c, i) => (
                <Row key={c.slot} label={`Cellules ${sh.cells.length > 1 ? i + 1 : ''}`.trim()} value={`${int(c.ammo)} × ${int(c.heal)} MJ`} hint={`Mise en route ${dec1(c.spinup)} s`} />
              ))}
              {sh.cells.length > 0 && <Row label="Total des cellules" value={`${int(sh.cellsTotal)} MJ`} />}
            </tbody>
          </table>
        ) : <p className="muted small">Aucun générateur de boucliers (ou trop faible pour la masse du vaisseau).</p>}
      </Card>

      <Card title="Coque">
        <table className="table compact">
          <tbody>
            <Row label="Intégrité" value={int(s.armour)} />
            <Row label="Base du vaisseau" value={int(s.hull.base)} />
            <Row
              label="Renforts de modules"
              value={s.hull.moduleProtection.length ? `${s.hull.moduleProtection.length} · ${dec1(s.hull.moduleProtectionTotal ?? Math.max(...s.hull.moduleProtection))} % absorbés` : 'aucun'}
              hint={s.hull.moduleProtection.length > 1 ? `Renforts cumulés : chacun absorbe sa part de ce que les autres laissent passer (${s.hull.moduleProtection.map((p) => `${dec1(p)} %`).join(', ')})` : undefined}
            />
            {s.hull.moduleProtection.length > 0 && s.hull.moduleIntegrity != null && (
              <Row label="Intégrité des renforts" value={int(s.hull.moduleIntegrity)} hint="Points de tous les renforts de modules : une fois épuisés, ils ne protègent plus" />
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Armement" full>
        {a.list.length ? (
          <>
            <div className="builder-cols">
              <table className="table compact">
                <tbody>
                  <Row label="DPS soutenu" value={dec1(a.sustained)} />
                  <Row label="DPS en rafale" value={dec1(a.burst)} />
                  <Row label="Chaleur des armes" value={`${dec1(a.heat)} /s`} />
                </tbody>
              </table>
              <table className="table compact">
                <tbody>
                  <Row
                    label="Tirage WEP soutenu"
                    value={`${dec2(a.wepDrainSustained ?? a.wepDrain)} MW`}
                    tone={s.distributor && (a.wepDrainSustained ?? a.wepDrain) > s.distributor.wep.chg + 1e-9 ? 'warn' : 'good'}
                    hint="Ce que toutes les armes tirent du condensateur WEP en tir soutenu, rechargements compris : orange s'il dépasse la recharge"
                  />
                  <Row label="Tirage WEP en rafale" value={`${dec2(a.wepDrain)} MW`} hint="Chargeurs pleins, sans rechargement : c'est lui qui fixe la durée du tir continu" />
                  <Row label="Recharge WEP" value={s.distributor ? `${dec2(s.distributor.wep.chg)} MW` : '—'} />
                  {a.wepSustain != null && (
                    <Row
                      label="Soutenabilité WEP"
                      value={`${int(a.wepSustain * 100)} %`}
                      tone={a.wepSustain < 1 - 1e-9 ? 'warn' : 'good'}
                      hint="Part du DPS soutenu que le distributeur entretient sans fin, une fois le condensateur WEP vide (comme EDSY, pondérée par le DPS de chaque arme)"
                    />
                  )}
                  <Row label="Tir continu" value={a.wepTime == null ? 'illimité' : secs(a.wepTime)} tone={a.wepTime == null ? 'good' : a.wepTime < 15 ? 'warn' : ''} hint="Avant de vider le condensateur WEP, toutes armes en tir, rechargements compris" />
                  {a.ammoTime !== undefined && (
                    <Row
                      label="Munitions, la plus courte"
                      value={a.ammoTime != null ? secs(a.ammoTime) : a.wepStall ? 'jamais à court' : '∞'}
                      tone={a.ammoTime == null && a.wepStall ? 'warn' : ''}
                      hint={a.ammoTime == null && a.wepStall
                        ? "Recharge WEP nulle : les armes qui tirent sur le condensateur s'arrêtent quand il est vide (voir Tir continu), avant d'avoir épuisé leurs munitions"
                        : 'Temps de tir continu avant que la première arme soit à court de munitions, ralenti une fois le condensateur WEP vide'}
                    />
                  )}
                </tbody>
              </table>
            </div>
            <DamageBar byType={a.byType} total={a.sustained} />
            <div className="builder-table-scroll">
              <table className="table compact builder-weapons">
                <thead>
                  <tr>
                    <th>Emplacement</th><th>Arme</th><th>Dégâts</th>
                    <th className="right">DPS</th><th className="right">Rafale</th><th className="right">Par tir</th>
                    <th className="right">Tirs/s</th><th className="right">Perfor.</th><th className="right">Portée</th>
                    <th className="right">WEP</th><th className="right">Chaleur</th><th className="right">Énergie</th>
                    <th className="right" title="Chargeur / réserve">Munitions</th>
                    <th className="right" title="Temps de tir continu jusqu'à la dernière munition ; une arme qui tire sur le condensateur WEP ralentit une fois celui-ci vide">Autonomie</th>
                  </tr>
                </thead>
                <tbody>
                  {a.list.map((w) => {
                    const main = Object.entries(w.damage).filter(([, v]) => v > 0).map(([k, v]) => `${TYPES[k]}${v < 1 ? ` ${int(v * 100)} %` : ''}`).join(', ');
                    return (
                      <tr key={w.slot}>
                        <td className="muted small">{slotLabel(w.slot)}</td>
                        <td>{weaponLabel(w.slot)}</td>
                        <td className="small">{main || '—'}</td>
                        <td className="right num">{dec1(w.sdps)}</td>
                        <td className="right num">{dec1(w.bdps)}</td>
                        <td className="right num">{w.rof == null ? '—' : dec2(w.damagePerShot)}</td>
                        <td className="right num">{w.rof == null ? 'continu' : dec2(w.rof)}</td>
                        <td className="right num">{int(w.pierce)}</td>
                        <td className="right num">{w.range ? `${dec1(w.range / 1000)} km` : '—'}</td>
                        <td className="right num">{dec2(w.dist)} MW</td>
                        <td className="right num">{dec1(w.heat)}/s</td>
                        <td className="right num">{dec2(w.power)} MW</td>
                        <td className="right num" title={w.ammo?.fuel ? 'Rechargée sur le carburant du vaisseau' : undefined}>{w.ammo ? `${int(w.ammo.clip)} / ${w.ammo.fuel ? 'carburant' : int(w.ammo.max)}` : '∞'}</td>
                        {w.wepStall ? (
                          <td className="right num warn" title="Recharge WEP nulle : l'arme s'arrête une fois le condensateur WEP vide, avant d'avoir épuisé ses munitions">WEP vide</td>
                        ) : (
                          <td className="right num">{w.ammoTime ? secs(w.ammoTime) : '∞'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="muted small">Aucune arme.</p>}
      </Card>

      <Card title="Énergie et chaleur">
        <table className="table compact">
          <tbody>
            <Row label="Générateur" value={`${dec2(s.power.capacity)} MW`} />
            <Row label="Tirage, armes sorties" value={`${dec2(s.power.deployed)} MW`} tone={powerLeft < 0 ? 'bad' : ''} />
            <Row label="Tirage, armes rentrées" value={`${dec2(s.power.retracted)} MW`} />
            <Row label="Marge" value={`${dec2(powerLeft)} MW`} tone={powerLeft < 0 ? 'bad' : powerLeft < 1 ? 'warn' : 'good'} />
            <Row label="Capacité thermique" value={int(s.heat.capacity)} />
            <Row label="Chaleur du générateur" value={`${dec1(s.heat.powerPlant)} /s`} />
            <Row label="Chaleur des armes" value={`${dec1(s.heat.weapons)} /s`} />
          </tbody>
        </table>
      </Card>

      {s.distributor && (
        <Card title="Distributeur">
          <table className="table compact">
            <thead>
              <tr><th /><th className="right">Capacité</th><th className="right">Recharge</th></tr>
            </thead>
            <tbody>
              {[['WEP', 'wep'], ['SYS', 'sys'], ['ENG', 'eng']].map(([label, k]) => (
                <tr key={k}>
                  <td className="muted">{label}</td>
                  <td className="right num">{dec1(s.distributor[k].cap)} MJ</td>
                  <td className="right num">{dec2(s.distributor[k].chg)} MW</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Saut et carburant">
        <table className="table compact">
          <tbody>
            <Row label="Saut maximal" value={`${dec2(s.jump.max)} al`} />
            <Row label="À vide, plein fait" value={`${dec2(s.jump.unladen)} al`} />
            <Row label="Soute pleine" value={`${dec2(s.jump.laden)} al`} />
            <Row label="Portée totale (un plein)" value={`${dec1(s.jump.range)} al`} hint="Sauts enchaînés à vide jusqu'à la dernière goutte" />
            <Row label="Carburant par saut max." value={`${dec2(s.jump.fuelPerJump)} t`} />
            <Row label="Réservoir" value={`${int(s.fuel)} t`} />
          </tbody>
        </table>
      </Card>

      <Card title="Mobilité">
        <table className="table compact">
          <tbody>
            <Row label="Vitesse" value={`${int(s.speed)} m/s`} />
            <Row label="Boost" value={s.boost ? `${int(s.boost)} m/s` : 'impossible'} tone={s.boost ? '' : 'bad'} />
            <Row label="Boosts d'affilée" value={int(s.boosts)} hint="Condensateur ENG plein" />
            {s.rotation && (
              <>
                <Row label="Tangage" value={`${dec1(s.rotation.pitch)} °/s`} />
                <Row label="Roulis" value={`${dec1(s.rotation.roll)} °/s`} />
                <Row label="Lacet" value={`${dec1(s.rotation.yaw)} °/s`} />
              </>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="Masse et capacités">
        <table className="table compact">
          <tbody>
            <Row label="Coque" value={`${int(s.mass.hull)} t`} />
            <Row label="À vide (sans carburant)" value={`${dec1(s.mass.dry)} t`} />
            <Row label="Plein fait" value={`${dec1(s.mass.unladen)} t`} />
            <Row label="Soute pleine" value={`${dec1(s.mass.laden)} t`} />
            <Row label="Soute" value={`${int(s.cargo)} t`} />
            {s.cabins > 0 && <Row label="Passagers" value={int(s.cabins)} />}
          </tbody>
        </table>
      </Card>

      {s.cost && (
        <Card title="Prix">
          <table className="table compact">
            <tbody>
              <Row label="Coque" value={`${int(s.cost.hull)} cr`} />
              <Row label="Modules" value={`${int(s.cost.total - s.cost.hull)} cr`} />
              <Row label="Total" value={`${int(s.cost.total)} cr`} />
              <Row label="Rachat (5 %)" value={`${int(s.cost.rebuy)} cr`} />
            </tbody>
          </table>
          <p className="tiny muted">Prix catalogue, sans remise.</p>
        </Card>
      )}

      <p className="tiny muted builder-cards-note">
        Modifications comptées au maximum de leur grade. Calculs vérifiés contre EDSY ; résistances avec rendements décroissants. Chaleur indicative.
      </p>
    </div>
  );
}
