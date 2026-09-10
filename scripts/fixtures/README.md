# LeagueOS series audit snapshot

Public tournament metadata read from cen-sql on September 10, 2026 after the LeagueOS import. Contains all 1,100 imported rows, with only tournament identity, title, game, organizer and date fields; no rosters or player data.

Expected authoritative relationships: 58 parent leagues, 51 with multiple tournaments, 38 with multiple games. Those 38 contain 1,048 tournaments. Tests exercise discovery enrichment, profile membership and rendered concluded league coverage against this entire snapshot.

The parent key is the league portion of `sourceTournamentId` (`leagueId:eventId`), as emitted by the collector. Seasons and divisions remain child tournaments within a league. Equal names in different source leagues must never merge.

## start.gg and FACEIT

`provider-parents-3610.json` contains every start.gg and FACEIT row read from cen-sql on the same date, limited to public tournament/organizer metadata. Of 2,431 start.gg rows, 1,188 have an owner URL identifying one of 610 accounts. Of 1,179 FACEIT rows, 252 have an organizer URL identifying one of 125 organizers. These are broad organizer catalogs spanning seasons, not inferred competitive circuits. Missing identities must not be guessed from names.

The live Challonge table had no non-draft tournaments. Its community-subdomain path is covered by synthetic database-to-discovery fixtures in `server-efficiency.test.mjs` instead of claiming real-data coverage.

## Separate series layer

Parent IDs are retained as metadata and organizer profile links. Series membership is now inferred within each parent; see `docs/series-audit.md` for the current grouping audit and known unassigned rows. Fixture counts above describe authoritative parents, not the number of competition series.
