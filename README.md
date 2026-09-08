# FC Translogistika — daily OLE statistics

Public data for [tlspb.ru/fc](https://tlspb.ru/fc): standings, last league result and next dated league fixture.

The scheduled GitHub Action opens the public OLE website in Chromium and reads its rendered table and match cards. It does not call the OLE API or need a user server, a running Mac, OLE credentials or Megagroup credentials.

## Schedule and costs

- Once daily at approximately **09:17 Moscow time** (06:17 UTC). GitHub schedules can be delayed.
- Standard `ubuntu-24.04` GitHub-hosted runner in this public repository; no paid runners, artifact uploads or dependency caches.
- Manual refresh: **Actions → OLE daily statistics → Run workflow**.
- The updater commits `data/stats.json`, including the actual successful `checkedAt` time. This records daily checks even when scores are unchanged.

## Data quality

- Explicit club, team, tournament and season IDs in `model.mjs` prevent reading another team or league.
- Table totals, result count, dates and both teams are checked before publishing.
- Fixtures without a date are counted but not presented as a dated next match.
- Failed checks leave the last successful JSON untouched. Check Actions for the error.
- The website retains its existing fallback and displays the date of its last successful check; old data is labelled after 48 hours.
- When OLE starts a new tournament/season, review its identity and update the configuration and website season text together. The current competition is the 2026 south-east top division, 8×8.

Public JSON: `https://raw.githubusercontent.com/tlspb/tlspb-fc-stats/main/data/stats.json`

## Maintenance

`node --test model.test.mjs` tests validation without network access. The workflow runs these tests before opening OLE. Playwright is pinned to version 1.63.0, Node.js 22.

Source layout changes may require adjusting selectors in `collect.mjs`. Keep errors visible instead of publishing partial data. To pause daily updates, disable **OLE daily statistics** in GitHub Actions. GitHub can also disable public scheduled workflows after 60 days without repository activity; re-enable it in Actions if necessary.

Only public football aggregates are stored here. No site source, customer data, CMS access or player profiles are included.
