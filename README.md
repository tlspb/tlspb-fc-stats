# TLSPB — daily OLE football statistics

Public football aggregates for [FC Translogistika](https://tlspb.ru/fc) and [Atletico-Dombay on the cargo-security demo](https://tlspb.ru/demo-cargo-security).

The scheduled GitHub Action opens the public OLE website in Chromium and reads its rendered standings, results and match cards. It does not call the OLE API or need a user server, a running Mac, OLE credentials or Megagroup credentials.

## Schedule and costs

- Once daily at approximately **09:17 Moscow time** (06:17 UTC). GitHub schedules can be delayed.
- Standard `ubuntu-24.04` GitHub-hosted runner in this public repository; no paid runners, artifact uploads or dependency caches.
- Manual refresh: **Actions → OLE daily statistics → Run workflow**.
- Each successful collection records its actual `checkedAt` time, including when scores remain unchanged.

## Clubs and public data

| Team | Competition | Collection files | Public JSON |
| --- | --- | --- | --- |
| Транслогистика | 2026 Юго-Восточная лига, Высший дивизион, 8×8 | `collect.mjs`, `model.mjs` | `data/stats.json` |
| Атлетико-Домбай | 2026 Суперлига, 8×8 | `collect-atletico.mjs`, `atletico-model.mjs` | `data/atletico.json` |

- Translogistika: `https://raw.githubusercontent.com/tlspb/tlspb-fc-stats/main/data/stats.json`
- Atletico-Dombay: `https://raw.githubusercontent.com/tlspb/tlspb-fc-stats/main/data/atletico.json`

Atletico-Dombay includes its latest two dated league results in `lastMatches`, season totals, standings position and the next dated league fixture. Translogistika keeps its existing data format. Raw GitHub data can take several minutes to refresh through its CDN.

## Data quality

- Explicit club, main-team, tournament and season identities prevent reading another team, reserve team or competition.
- Standings totals, all completed result counts and goal totals, dates and both teams are checked before publication.
- Fixtures without a date are counted but are not presented as dated next matches. Explicitly undated completed matches are checked against their match cards.
- Each club is collected independently. A source failure leaves that club's last successful JSON untouched; another club's successful snapshot can still be published. The workflow reports the failure so it remains visible in Actions.
- Website fallbacks remain dated. The date of the last successful check is shown; data older than 48 hours is labelled. An Atletico fixture is no longer advertised after its kickoff passes.
- When OLE starts a new tournament or season, review the identities and update each relevant model and website season text together.

## Maintenance

`node --test model.test.mjs atletico-model.test.mjs` validates the parsing and data guards without network access. The workflow runs these tests before opening OLE. Playwright is pinned to version 1.63.0, Node.js 22.

Source layout changes may require adjusting selectors in the relevant collection file. Keep errors visible instead of publishing partial data. To pause daily updates, disable **OLE daily statistics** in GitHub Actions. GitHub can also disable public scheduled workflows after 60 days without repository activity; re-enable the workflow in Actions if necessary.

Only public football aggregates are stored here. No site source, customer data, CMS access or player profiles are included.
