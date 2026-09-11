# LeagueOS series audit snapshot

Public tournament metadata read from cen-sql on September 10, 2026 after the LeagueOS import. Contains all 1,100 imported rows, with only tournament identity, title, game, organizer and date fields; no rosters or player data.

Expected authoritative relationships: 58 parent leagues, 51 with multiple tournaments, 38 with multiple games. Those 38 contain 1,048 tournaments. Tests exercise discovery enrichment, profile membership and rendered concluded league coverage against this entire snapshot.

The parent key is the league portion of `sourceTournamentId` (`leagueId:eventId`), as emitted by the collector. Seasons and divisions remain child tournaments within a league. Equal names in different source leagues must never merge.

## start.gg and FACEIT

`provider-parents-3610.json` contains every start.gg and FACEIT row read from cen-sql on the same date, limited to public tournament/organizer metadata. Of 2,431 start.gg rows, 1,188 have an owner URL identifying one of 610 accounts. Of 1,179 FACEIT rows, 252 have an organizer URL identifying one of 125 organizers. These are broad organizer catalogs spanning seasons, not inferred competitive circuits. Missing identities must not be guessed from names.

The live Challonge table had no non-draft tournaments. Its community-subdomain path is covered by synthetic database-to-discovery fixtures in `server-efficiency.test.mjs` instead of claiming real-data coverage.

## Separate series layer

Parent IDs are retained as metadata and organizer profile links. Series membership is now inferred within each parent; see `docs/series-audit.md` for the current grouping audit and known unassigned rows. Fixture counts above describe authoritative parents, not the number of competition series.

## WRMSEC preseason bracket (2026-09-10)

`wrmsec-preseason.json` is the normalized public schedule from
https://wrmsec.leagueos.gg/schedule/rl/3g1u059qkmgq0ojweucqupkdo/standings.
The LeagueOS extended season endpoint announces five stages. Its separately
paginated stage-match endpoints return 11 and 10 preseason matches, followed by
three empty future stages. Both preseason stages use round-robin method 0,
`rrRoundLimit: 1`, and `rrGroupSize: 0`: disconnected pairings are not pools.
The fixture retains only normalized display fields, not roster member data.
Blank roster names use their public school name and color tag via the collector.

Two older seasons (`03ngd4f5e1ohkrnb95njxqq73` and
`13bzve2a3mnci8ykjvs19ii1k`) were also checked through the public extended endpoint;
both have the same two one-round preseason stages without groups. This is a
source-level spot check, not an audit of the entire production database.

## WRMSEC SSBU formats (2026-09-10)

`wrmsec-ssbu.json` contains normalized public stages from LeagueOS season
`eni7eeafuikb0oyg73t74kj6u`: Preseason Week 2 (39 matches), Season (222 matches,
6 rounds), and Playoff Bracket (16 matches). The first two stages explicitly use
method 0 (round robin); playoffs use method 1 (single elimination). The 16th
playoff match takes position 2 from both semifinals: it is the third-place match,
not another pool. Draft Preseason Week 1 is excluded by the existing public-stage
filter. The raw source listed Season, Playoffs, then preseason; the collector now
orders stages by start date. Only normalized tournament display fields are kept.
