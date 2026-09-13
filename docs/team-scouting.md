# Team scouting

Player searches accept a FACEIT nickname, player UUID, or profile/stats link; links are parsed locally and only the extracted identity is sent to FACEIT.

The Player / Team switch is independent of Quick / Deep. Team searches accept a cached team name, `name(tag)`, a team UUID, or a FACEIT team URL. The dropdown searches local public FACEIT identities from `faceit_scout_teams`, `faceit_players`, and linked Overwatch teams/rosters in `pd_teams` / `pd_team_members`. It does not call FACEIT search. Exact names/tags rank first, followed by prefixes and literal substring matches, with deterministic name/tag/ID ordering. Duplicate cache entries merge by ID.

Clicking a suggestion (or pressing Enter on a keyboard-highlighted option) starts a search with its exact ID. Submitting a plain name uses the first local suggestion in that same order. Player names with no local suggestion can still use FACEIT's direct exact-nickname profile endpoint. Teams absent from the local directory need a link or ID once; the resulting profile becomes available for name lookup. Selected identity and display name persist together so identical names do not silently switch identities on a later visit. The Worker no longer uses FACEIT's fuzzy team search.

Team identity and the current roster come from FACEIT Data API `/teams/{id}`. Match membership comes exclusively from the team Stats page's `/stats/v1/stats/time/teams/{id}/games/ow2` feed. Its per-map entries are deduplicated to match IDs in `faceit_scout_team_matches`. The existing detail collector fills those matches; every roster member also receives their own player-history collection. Team aggregates select one participant per team-feed match, so teammate duplicates do not multiply maps and former-roster matches remain visible.

The team map graph uses an equal-weight average of current roster members' individual map win rates. Whiskers span the lowest and highest known player rates. Undecided/missing rates are excluded, and each row reports how many roster members contribute. The header and graph caption report the team's own match record separately. Player dots show summaries on hover, keyboard focus, or tap; identical rates separate vertically without changing their percentage positions.

Quick collects a recent team window and recent player details while showing incremental results. Deep waits for the entire team list, match details, and each roster member's history. Both advance in bounded resumable requests while the search is open. Reopening/researching uses the saved cache; it never substitutes player histories for a failed team feed.

## Rollout

1. In `ow-data`, apply the generated `0003_melted_vin_gonzales.sql` migration using the existing FACEIT migration command (`npm run db:faceit:migrate:remote` for production). This adds two tables and does not alter existing player/match tables.
2. Deploy `ow-data`, then deploy Commons. The new Worker endpoints are `/faceit/team/search` and `/faceit/team/advance`, authenticated with the existing poller secret.
3. Smoke-test Quick and Deep with `LGBTQI-AIM(AIM)` and confirm it resolves to `df36dcb1-6397-4f2d-8fca-562bad8f307f`. Verify the team feed works from the deployed Worker before treating live collection as verified.

Local verification: the real team lookup resolved the example and six roster members. FACEIT returned HTTP 403 for direct team-history requests from the development machine; end-to-end collection tests therefore use provider fixtures. Desktop/mobile browser checks use the actual React components with fixture responses. No remote migration or deployment was performed as part of this change.

## Deep-scan completion and diagnostics

Roster collection checks the underlying match sync markers before skipping a player. A cached `detail_done` flag is insufficient: another player's scan can add unfinished shared matches after that flag was written. Deep readiness requires each available member's history list and details to be complete, even when that member is already quick-ready. Temporary provider errors remain retryable and do not count as completed members.

The loading view reports whether it is paging team history or collecting roster histories. Collector failures retain the selected team and surface the failing page/stage while retrying, instead of leaving only the last successful match counter visible. A full counter does not imply the history list has been exhausted.

These fixes require deploying both `ow-data` (the collector) and Commons (readiness and failure display). No new migration is needed. Regression coverage exercises the real collector against SQLite with provider fixtures; the stale-completion case fails against the preceding collector commit. Live verification still requires access to the affected site's authenticated scan and collection state.
