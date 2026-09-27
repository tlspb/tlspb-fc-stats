import test from 'node:test';
import assert from 'node:assert/strict';
import {config,parseTable,parseMatch,parseResultRows,russianDate,matchUrl,validateSnapshot} from './model.mjs';
const row = {name:'Транслогистика',headers:['И','В','Н','П','Голы','О'],values:['19','12','3','4','70-42','39'],position:'3',teamCount:14};
const rawMatch = {
  url:'https://olesports.ru/match/6a6c80ae29f5825765821f2b',competition:'Высший',round:'19 тур',date:'6 сентября 2026',venueTime:'РЖД. Поле 1 19:25',scores:['6','3'],
  teams:[{name:config.teamName,href:`/club/${config.clubId}?team=${config.teamId}`},{name:'Рабона',href:'/club/62ff52404e0d681d80aa821b?team=62ff52404e0d681d80aa821c'}],
};
test('actual 2026 standings snapshot',()=>assert.deepEqual(parseTable(row),{position:3,teamCount:14,played:19,won:12,drawn:3,lost:4,goalsFor:70,goalsAgainst:42,points:39}));
test('reject incomplete, changed and inconsistent standings',()=>{
  for(const bad of [{...row,values:['19','12','3','5','70-42','39']},{...row,headers:['И','В','Н','П','О','Голы']},{...row,name:'Другая команда'},{...row,values:['','','','','','']},{...row,position:'15'}]) assert.throws(()=>parseTable(bad));
});
test('full Russian dates and impossible dates',()=>{
  assert.equal(russianDate('13 сентября 2026, (вс)'),'2026-09-13');
  assert.equal(russianDate('06 СЕНТЯБРЯ 2026'),'2026-09-06');
  assert.equal(russianDate('29 февраля 2028'),'2028-02-29');
  for(const date of ['31 февраля 2026','13 сентября','Дата не назначена']) assert.throws(()=>russianDate(date));
});
test('result, clean sheet and draw remain valid',()=>{
  const result = parseMatch(rawMatch,'finished');
  assert.deepEqual(result.score,[6,3]);assert.equal(result.venue,'РЖД. Поле 1');assert.equal(result.kickoff,'19:25');
  assert.equal(parseMatch({...rawMatch,competition:'ВЫСШИЙ',date:'06 СЕНТЯБРЯ 2026'},'finished').date,'2026-09-06');
  assert.deepEqual(parseMatch({...rawMatch,scores:['0','0']},'finished').score,[0,0]);
});
test('reject wrong team, season, competition, URL and partial score',()=>{
  for(const bad of [{...rawMatch,scores:['6','-']},{...rawMatch,date:'6 сентября 2025'},{...rawMatch,competition:'Кубок'},{...rawMatch,teams:[rawMatch.teams[1],rawMatch.teams[1]]},{...rawMatch,url:'https://other.example/match/6a6c80ae29f5825765821f2b'}]) assert.throws(()=>parseMatch(bad,'finished'));
  assert.throws(()=>matchUrl('javascript:alert(1)'));
});
test('scheduled match may have unknown kickoff, never a fabricated score',()=>{
  const fixture=parseMatch({...rawMatch,scores:['-','-'],venueTime:'РЖД. Поле 1'},'scheduled');
  assert.equal(fixture.kickoff,null);assert.equal(fixture.score,null);
  assert.throws(()=>parseMatch(rawMatch,'scheduled'));
});
test('last good data is protected against regression and future results',()=>{
  const data={schemaVersion:1,...config,checkedAt:'2026-09-08T17:00:00.000Z',table:parseTable(row),lastMatch:parseMatch(rawMatch,'finished'),nextMatch:null};
  assert.equal(validateSnapshot(data),data);
  assert.throws(()=>validateSnapshot({...data,table:{...data.table,played:18,won:11}},data));
  assert.throws(()=>validateSnapshot({...data,lastMatch:{...data.lastMatch,date:'2027-01-01'}}));
  assert.throws(()=>validateSnapshot({...data,nextMatch:{date:'2026-09-01'}}));
});

// Regression: OLE added a 5:0 result under "Дата не назначена" on 22 September.
// Numeric scores are authoritative; no date or explanation should be invented.
const resultRows = [
  {href:'/match/6a6c80ae29f5825765821f2b',names:[config.teamName,'Рабона'],scores:['6','3'],dateLabel:'6 сентября 2026',dateUnassigned:false,time:'19:25'},
  {href:'/match/6a6c80ae29f5825765821f09',names:['СБГ',config.teamName],scores:['2','1'],dateLabel:'13 сентября 2026',dateUnassigned:false,time:'19:25'},
  {href:'/match/6a6c80ae29f5825765821ee3',names:[config.teamName,'Ангелболл'],scores:['5','0'],dateLabel:null,dateUnassigned:true,time:'--:--'},
];
const resultTotals = {played:3,won:2,drawn:0,lost:1,goalsFor:12,goalsAgainst:5};
test('undated result counts in standings without replacing the latest dated match',()=>{
  const result = parseResultRows(resultRows,resultTotals);
  assert.equal(result.dated[0].date,'2026-09-13');
  assert.equal(result.dated.length,2);
  assert.equal(result.undated.length,1);
  assert.equal(result.undated[0].date,null);
  assert.deepEqual(result.undated[0].scores,['5','0']);
});
test('missing or changed markup, duplicates and inconsistent scores still fail closed',()=>{
  const badRows = [
    [...resultRows.slice(0,2),{...resultRows[2],dateUnassigned:false}],
    [...resultRows.slice(0,2),{...resultRows[2],scores:['-','-']}],
    [...resultRows.slice(0,2),{...resultRows[2],scores:['6','0']}],
    [...resultRows.slice(0,2),{...resultRows[2],dateLabel:'27 сентября 2026'}],
    [...resultRows.slice(0,2),{...resultRows[2],href:resultRows[0].href}],
    [...resultRows.slice(0,2),{...resultRows[2],dateLabel:'6 сентября 2025',dateUnassigned:false}],
    resultRows.slice(0,2),
  ];
  for (const rows of badRows) assert.throws(()=>parseResultRows(rows,resultTotals));
  for (const field of Object.keys(resultTotals)) assert.throws(()=>parseResultRows(resultRows,{...resultTotals,[field]:resultTotals[field]+1}));
});
test('undated card needs explicit list confirmation, a score and the correct team',()=>{
  const undated = {...rawMatch,date:'Invalid date',venueTime:' --:--',scores:['5','0']};
  const result = parseMatch(undated,'finished',{allowUndated:true});
  assert.equal(result.date,null);assert.equal(result.kickoff,null);assert.equal(result.venue,'');
  assert.deepEqual(result.score,[5,0]);
  assert.throws(()=>parseMatch(undated,'finished'));
  assert.throws(()=>parseMatch({...undated,scores:['-','-']},'scheduled',{allowUndated:true}));
  assert.throws(()=>parseMatch({...undated,date:''},'finished',{allowUndated:true}));
  assert.throws(()=>parseMatch({...undated,teams:[rawMatch.teams[1],rawMatch.teams[1]]},'finished',{allowUndated:true}));
});
test('undated fixtures never count as completed results in a snapshot',()=>{
  const undated=parseMatch({...rawMatch,date:'Invalid date',scores:['5','0']},'finished',{allowUndated:true});
  const data={schemaVersion:1,...config,checkedAt:'2026-09-26T06:30:00.000Z',table:parseTable(row),lastMatch:parseMatch(rawMatch,'finished'),nextMatch:null,undatedResults:[undated]};
  assert.equal(validateSnapshot(data),data);
  for (const bad of [{...undated,status:'scheduled'},{...undated,date:'2026-09-27'},{...undated,score:[5,'-']}]) assert.throws(()=>validateSnapshot({...data,undatedResults:[bad]}));
});
