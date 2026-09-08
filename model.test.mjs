import test from 'node:test';
import assert from 'node:assert/strict';
import {config,parseTable,parseMatch,russianDate,matchUrl,validateSnapshot} from './model.mjs';
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
