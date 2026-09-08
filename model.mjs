// Public team aggregates only. No OLE API, credentials or player profiles.
export const config = Object.freeze({
  clubId: '69eb8fbcb2c23fc612a69398',
  teamId: '69eb8fbcb2c23fc612a6939a',
  tournamentId: '69c44c9c58b34123d1da53e6',
  teamName: 'Транслогистика',
  season: 2026,
  tournamentName: 'Юго-Восточная лига · Высший дивизион · 8×8',
});
export const tournamentUrl = `https://olesports.ru/tournament/${config.tournamentId}?section=stats`;
export const clubUrl = `https://olesports.ru/club/${config.clubId}?team=${config.teamId}`;
const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
export function integer(value, label, min = 0, max = 10000) {
  requireValue(/^\d+$/.test(String(value)), `Invalid ${label}: ${value}`);
  const number = Number(value);
  requireValue(Number.isSafeInteger(number) && number >= min && number <= max, `Out of range: ${label}`);
  return number;
}
export function russianDate(text) {
  text = text.toLocaleLowerCase('ru-RU');
  const parts = text.match(/\b(\d{1,2})\s+([а-я]+)\s+(20\d{2})\b/u);
  requireValue(parts, `Missing full date: ${text}`);
  const [,day,month,year] = parts;
  const m = months.indexOf(month) + 1;
  requireValue(m > 0, 'Unknown Russian month');
  const date = `${year}-${String(m).padStart(2,'0')}-${day.padStart(2,'0')}`;
  requireValue(new Date(date + 'T12:00:00Z').toISOString().startsWith(date), 'Invalid calendar date');
  return date;
}
export function parseTable(raw) {
  requireValue(raw.name === config.teamName, 'Wrong team in standings');
  requireValue(JSON.stringify(raw.headers) === JSON.stringify(['И','В','Н','П','Голы','О']), 'Standings headers changed');
  requireValue(raw.values.length === 6, 'Incomplete standings row');
  const goals = raw.values[4].match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  requireValue(goals, 'Invalid goals column');
  const [played,won,drawn,lost] = raw.values.slice(0,4).map((v,i)=>integer(v,['played','won','drawn','lost'][i],0,200));
  requireValue(played === won + drawn + lost, 'Standings totals disagree');
  const teamCount = integer(raw.teamCount,'teamCount',2,100);
  return {
    position:integer(raw.position,'position',1,teamCount),teamCount,played,won,drawn,lost,
    goalsFor:integer(goals[1],'goalsFor'),goalsAgainst:integer(goals[2],'goalsAgainst'),
    points:integer(raw.values[5],'points'),
  };
}
export function matchUrl(value) {
  const url = new URL(value,'https://olesports.ru');
  requireValue(url.origin === 'https://olesports.ru' && /^\/match\/[a-f\d]{24}$/.test(url.pathname), 'Invalid match URL');
  return url.origin + url.pathname;
}
export function parseMatch(raw, kind) {
  requireValue(['finished','scheduled'].includes(kind),'Unknown match kind');
  requireValue(raw.teams.length === 2 && raw.scores.length === 2, 'Incomplete match');
  const teams = raw.teams.map(t=>{
    const url = new URL(t.href,'https://olesports.ru');
    requireValue(/^\/club\/[a-f\d]{24}$/.test(url.pathname),'Missing club identity');
    requireValue(t.name.length > 0 && t.name.length < 100,'Invalid team name');
    return {name:t.name,clubId:url.pathname.split('/').pop(),teamId:url.searchParams.get('team')};
  });
  const ours = teams.filter(t=>t.clubId === config.clubId && t.teamId === config.teamId);
  requireValue(ours.length === 1 && ours[0].name === config.teamName,'Wrong team in match');
  requireValue(raw.competition.toLocaleLowerCase('ru-RU') === 'высший','Wrong match competition');
  const date = russianDate(raw.date);
  requireValue(Number(date.slice(0,4)) === config.season,'Wrong match season');
  const tour = raw.round.match(/^(\d+)\s+тур$/);
  requireValue(tour,'Missing match round');
  const time = raw.venueTime.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  const kickoff = time ? time[0] : null;
  const venue = raw.venueTime.replace(/\s*\b([01]\d|2[0-3]):([0-5]\d)\b\s*/,' ').trim();
  requireValue(venue.length < 160,'Invalid venue');
  const score = kind === 'finished' ? raw.scores.map((s,i)=>integer(s,`score ${i}`,0,100)) : null;
  if (kind === 'scheduled') requireValue(raw.scores.every(s=>s === '-'),'Scheduled match already has a score');
  return {url:matchUrl(raw.url),status:kind,date,kickoff,venue,round:integer(tour[1],'round',1,200),home:teams[0],away:teams[1],score};
}
export function validateSnapshot(data, previous = null) {
  requireValue(data.schemaVersion === 1,'Wrong schema');
  requireValue(data.clubId === config.clubId && data.teamId === config.teamId && data.tournamentId === config.tournamentId && data.season === config.season,'Wrong dataset');
  const checkedAt = Date.parse(data.checkedAt);
  requireValue(Number.isFinite(checkedAt) && checkedAt <= Date.now() + 300000,'Invalid check timestamp');
  const t = data.table;
  for (const field of ['position','teamCount','played','won','drawn','lost','goalsFor','goalsAgainst','points']) integer(t[field],field);
  requireValue(t.played === t.won + t.drawn + t.lost && t.position >= 1 && t.position <= t.teamCount,'Invalid standings');
  requireValue(t.played === 0 || data.lastMatch !== null,'Missing last result');
  if (data.lastMatch) requireValue(Date.parse(data.lastMatch.date + 'T00:00:00+03:00') <= checkedAt,'Result is in the future');
  if (data.nextMatch) requireValue(Date.parse(data.nextMatch.date + 'T23:59:59+03:00') >= checkedAt,'Next match is in the past');
  if (previous && previous.tournamentId === data.tournamentId) {
    requireValue(data.table.played >= previous.table.played,'Played games decreased; needs source review');
    if (previous.lastMatch && data.lastMatch) requireValue(data.lastMatch.date >= previous.lastMatch.date,'Latest result moved backwards');
  }
  return data;
}
