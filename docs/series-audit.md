# Series layer audit — September 10, 2026

The provider parent is retained in `providerParentId` / `providerParentName`. `organizationId` remains available for reviewed organization identities. `seriesId` now identifies a competition within that parent. Historical parent profile links resolve as organizer pages.

Series grouping normalizes explicit seasons, academic years, game labels and installments. It preserves named competitions and distinct programs. Dates never manufacture a season; uncertain records keep their parent and remain unassigned to a series.

## Current data

Read-only audit of 4,716 live rows (2,437 start.gg, 1,179 FACEIT and 1,100 LeagueOS), before correcting the five missing Lalter organizer names.

| Provider | Rows | Parent linked | Series assigned | Distinct series |
|---|---:|---:|---:|---:|
| faceit | 1179 | 252 | 200 | 157 |
| leagueos | 1100 | 1100 | 954 | 365 |
| startgg | 2437 | 1194 | 577 | 388 |

These are classification counts, not a claim that every inferred singleton is a league. The UI shows recurring groups and explicit named seasons, including concluded series.

## NECC

318 stored tournaments retain one parent. 312 classify into the following 12 series; six undated game signup records retain their parent without a guessed season.

| Series | Tournaments |
|---|---:|
| NECC · Fall 2023 | 33 |
| NECC · Fall 2023 · Samsung Fall Open | 3 |
| NECC · Fall 2024 | 48 |
| NECC · Fall 2024 · Mashup Tournament | 1 |
| NECC · Fall 2025 | 61 |
| NECC · Spring 2024 | 37 |
| NECC · Spring 2024 · Promotion Tournament | 4 |
| NECC · Spring 2025 | 54 |
| NECC · Spring 2026 | 68 |
| NECC · Spring 2026 · Invitational | 1 |
| NECC · Summer 2025 · Summer Tournament | 1 |
| NECC · Summer 2026 · Summer Tournament | 1 |

## Verification

- Regression fixtures cover 4,710 previously imported rows; the additional six live rows are included in the repeatable audit above.
- Tests cover parent preservation, cross-game season grouping, separate years/programs/brands, unknown signups, concluded rendering, valid profile links, cache version upgrades and staff corrections.
- The reported start.gg account `user/8763a415` was verified through the source API: `name` is null and `player.gamerTag` is `Lalter`. Five missing organizer names were corrected in cen-sql. Future imports use the public gamer tag when the name is absent.
- Remaining unknown organizer display names use a neutral label; account IDs are never substituted for series titles.

Re-run against fixtures: `node scripts/audit-series.mjs`. Pass a D1 JSON export and an output filename to audit a newer snapshot.
