import { formatCompact, type DamageHealing } from "@/lib/faceit-scouting-shared";

// Per-match damage vs healing as paired vertical bars (oldest → newest), each
// normalised to the window's max, so a player's damage/support split shows over
// time. Inline CSS-track bars, no chart lib.

export function DamageHealingChart({ data }: { data: DamageHealing }) {
  if (!data.points.length) {
    return <p className="ff-owchart__empty">No detailed matches yet.</p>;
  }
  const max = Math.max(1, ...data.points.flatMap((p) => [p.damage, p.healing]));
  return (
    <div className="ff-scoutdh">
      <div
        className="ff-scoutdh__bars"
        role="img"
        aria-label="Damage versus healing per match"
      >
        {data.points.map((p, i) => (
          <div
            className="ff-scoutdh__col"
            key={i}
            title={`DMG ${formatCompact(p.damage)} · HEAL ${formatCompact(p.healing)}`}
          >
            <span
              className="ff-scoutdh__bar ff-scoutdh__bar--dmg"
              style={{ height: `${(p.damage / max) * 100}%` }}
            />
            <span
              className="ff-scoutdh__bar ff-scoutdh__bar--heal"
              style={{ height: `${(p.healing / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="ff-scoutdh__legend">
        <span className="ff-scoutdh__key ff-scoutdh__key--dmg">
          Damage · avg {formatCompact(data.avgDamage)}
        </span>
        <span className="ff-scoutdh__key ff-scoutdh__key--heal">
          Healing · avg {formatCompact(data.avgHealing)}
        </span>
      </div>
    </div>
  );
}
