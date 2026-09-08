import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, rename, appendFile } from 'node:fs/promises';
import { config, tournamentUrl, clubUrl, requireValue, russianDate, parseTable, parseMatch, validateSnapshot, matchUrl } from './model.mjs';

// Reads rendered public pages, exactly the information a visitor sees.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'ru-RU',timezoneId:'Europe/Moscow'});
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(45000);
  await page.route('**/*', route => ['image','media','font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  await page.goto(tournamentUrl,{waitUntil:'domcontentloaded'});
  const anchor = page.locator(`.standings.desktop a[href="/club/${config.clubId}"]`);
  await anchor.waitFor();
  const rawTable = await anchor.evaluate(a=>{
    const row = a.closest('.standings-row');
    const table = row.closest('.standings');
    return {
      name:a.innerText.trim(),
      headers:[...table.querySelectorAll('.standings-head .standings-row_values .standings-cell')].map(x=>x.innerText.trim()),
      values:[...row.querySelectorAll('.standings-row_values .standings-cell')].map(x=>x.innerText.trim()),
      position:row.querySelector('.__pos span').innerText.trim(),
      teamCount:table.querySelectorAll('.standings-row a.__team').length,
    };
  });
  const table = parseTable(rawTable);
  async function listMatches(label) {
    await page.getByText(label,{exact:true}).click();
    // React swaps the list in place; allow its request to settle before reading.
    await page.waitForTimeout(2000);
    const list = await page.evaluate(teamName=>{
      const datePattern = /\b\d{1,2}\s+[а-я]+\s+20\d{2}\b/gu;
      return [...document.querySelectorAll('a.matches-list_group_list_item')]
        .map(a=>{
          const names = [...a.querySelectorAll('.team')].map(e=>e.innerText.trim());
          const group = a.closest('.matches-list_group');
          if(!group) throw new Error('Calendar group structure changed: '+a.parentElement.className);
          const dates = [...new Set(group.innerText.match(datePattern) || [])];
          if(dates.length>1) throw new Error('Ambiguous dates in calendar group');
          const dateLabel = dates[0] || null;
          return {href:a.getAttribute('href'),names,dateLabel,time:a.querySelector('.time')?.innerText.trim() || ''};
        }).filter(row=>row.names.includes(teamName));
    },config.teamName);
    requireValue(new Set(list.map(x=>x.href)).size === list.length,'Duplicate match rows');
    list.forEach(row=>{
      requireValue(row.names.length===2 && row.names.filter(n=>n===config.teamName).length===1,'Unexpected match teams');
      matchUrl(row.href);
    });
    console.log(label,JSON.stringify(list));
    return list;
  }
  const results = await listMatches('Результаты');
  requireValue(results.length === table.played,`Result count (${results.length}) disagrees with standings (${table.played})`);
  const datedResults = results.map(r=>({...r,date:russianDate(r.dateLabel || '')})).sort((a,b)=>b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const calendar = await listMatches('Календарь');
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const datedFixtures = calendar.filter(r=>r.dateLabel).map(r=>({...r,date:russianDate(r.dateLabel)}))
    .filter(r=>r.date >= today).sort((a,b)=>a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  // Undated fixtures stay off the next-match card until the organizer assigns a date.
  async function readMatch(row, status) {
    if(!row) return null;
    const url = matchUrl(row.href);
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Информация',exact:true}).click();
    await page.locator('.match-general_info .mean').first().waitFor();
    await page.locator('.match-main_team.__away').waitFor();
    const raw = await page.evaluate(()=>({
      url:location.href,
      teams:[...document.querySelectorAll('.match-main_team')].map(a=>({href:a.getAttribute('href'),name:a.querySelector('.match-team_name')?.innerText.trim() || ''})),
      scores:[...document.querySelectorAll('.match-main_score_cell')].map(e=>e.innerText.trim()),
      competition:document.querySelector('.match-general_info .mean.interactive')?.innerText.trim() || '',
      date:[...document.querySelectorAll('.match-general_info .mean')].find(e=>/20\d{2}/.test(e.innerText))?.innerText.trim() || '',
      round:[...document.querySelectorAll('.match-general_info .meta')].find(e=>/\d+\s+тур/.test(e.innerText))?.innerText.trim() || '',
      venueTime:[...document.querySelectorAll('.match-general_info .meta')].find(e=>!/^\d+\s+тур$/.test(e.innerText.trim()))?.innerText.trim() || '',
    }));
    const match = parseMatch(raw,status);
    requireValue(match.date === row.date,'Calendar and match card dates disagree');
    requireValue(match.home.name === row.names[0] && match.away.name === row.names[1],'Calendar and match teams disagree');
    return match;
  }
  const lastMatch = await readMatch(datedResults[0],'finished');
  const nextMatch = await readMatch(datedFixtures[0],'scheduled');
  let previous = null;
  try {previous=JSON.parse(await readFile('data/stats.json','utf8'));} catch(error) {if(error.code!=='ENOENT')throw error;}
  const snapshot = validateSnapshot({
    schemaVersion:1,checkedAt:new Date().toISOString(),...config,
    source:{tournament:tournamentUrl,club:clubUrl},table,lastMatch,nextMatch,
    undatedFixtures:calendar.filter(r=>!r.dateLabel).length,
  },previous);
  const json = JSON.stringify(snapshot,null,2)+'\n';
  await mkdir('data',{recursive:true});
  await writeFile('data/stats.json.tmp',json);
  await rename('data/stats.json.tmp','data/stats.json');
  console.log(json);
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Статистика ОЛЕ проверена\n\nПроверка: ${snapshot.checkedAt}\n\nМесто: ${table.position}/${table.teamCount} · Очки: ${table.points} · Матчи: ${table.played}\n\nПоследний матч: ${lastMatch?.home.name} — ${lastMatch?.away.name}, ${lastMatch?.score?.join(':')}\n\nСледующий матч: ${nextMatch ? `${nextMatch.date} ${nextMatch.kickoff || ''}, ${nextMatch.home.name} — ${nextMatch.away.name}` : 'Дата пока не назначена'}\n`);
} finally {
  await browser.close();
}
