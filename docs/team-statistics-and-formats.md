# Team statistics and tournament formats

Statistics contains Player Data, Match Data, and Team Data. Internal and external
team pages link directly to the selected team's statistics. Management pages
retain rosters, invitations, settings, and tournament entry controls.

## Team history and shared times

Managers/captains can associate provider teams their connected account belongs
to with one Commons team. All Commons roster members can then see the combined
cached history. Links use provider identities, never matching names. Unlinking
preserves provider history.

Team totals use all imported team matches, deduplicated by provider match id,
with the newest synced copy winning. The UI expands history in batches of 25.
Only finished, attributed results count toward the record. Competition filters
change both the record and history. Average SR reflects the current roster;
historical roster snapshots are not yet stored. Cross-provider copies of the
same real match are not automatically merged without an identity mapping.

Individual Match Data still displays the latest 300 imported matches and labels
its summary accordingly. This display limit does not limit the historical import
or the team totals.

Team Data also lets managers/captains report upcoming match times with an HTTPS
source link. Reports are shared by canonical match key across Statistics readers.
Writes append revisions; stale simultaneous edits are rejected. Team-reported
times remain separate from provider timestamps, and conflicts are visible.
The Schedule tab and external provider sites are not changed by these reports.

## Tournament formats

The scraper preserves start.gg phase `bracketType`, FACEIT championship `type`,
and the event's phase catalog. Announced stages can therefore have a format
before any matches exist. Each event and phase renders independently:

- Single/double elimination: bracket.
- Round robin: full-width results matrix, then curved matchup graph and rounds.
- Swiss/unconfirmed: rounds without invented elimination connections.

Old rows use conservative structural inference. Match-density thresholds are
removed; sparse schedules and unsupported provider formats remain unconfirmed.
Mixed tournaments are not forced into one format.

Round-robin fixes include upcoming rounds before completed rounds, second-round
emphasis based on the next actual round number, repeat meetings retained in the
matrix, completed draws staying completed, and playable matches no longer marked
live. Native modal dialogs handle focus and Escape.

## Validation

Commons:

```
npx tsc --noEmit
node --test scripts/statistics-formats.test.mjs scripts/server-efficiency.test.mjs
npm run build
```

Also run `npm run worker:check` and `npm run worker:test` in
cen-news-notifications, and `npm run typecheck` in ow-data.

Provider tests use controlled responses. Real SQLite/Drizzle tests cover link
permissions, concurrent time reports, and more than 300 distinct team matches
with duplicate and cross-provider rows. These tests do not establish live OAuth
account-history coverage. UI verification uses real components and synthetic
fixtures. The existing lint command prompts for ESLint setup; lint is not a
completed check.

## Release order

1. Apply Commons website-sql migrations 0021 and 0022.
2. Add `ext_matches.bracket_type` and `ext_events.phases_json` to cen-sql.
   Scraper migration 0009 and Commons projection migrations 0012/0013 add the
   **same columns in two existing migration histories**. Use the history already
   used for that database; do not apply both copies to one database.
3. Deploy the scraper, Commons, and ow-data. Refresh affected external tournaments
   to fill the metadata; older cached rows retain conservative inference until
   refreshed.

Local website-sql and Commons cen-sql migrations were exercised. Production
migrations/deployment and live account testing remain outstanding. Tournament
registration/OAuth write integration and Discord integration were not added.

The live start.gg schema was checked: Phase.bracketType and the four mapped enum
values are present. This verifies the schema contract, not live member histories.
Provider placements take precedence; elimination placements are not inferred for
Swiss, mixed, or unconfirmed tournaments.
