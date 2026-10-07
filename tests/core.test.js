// Запуск: node --test tests/core.test.js (Node.js 18+).
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../data.js'),C=require('../core.js');
function record(){return {version:D.version,code:'AL-1234567890ABCDEF',finishedAt:'2026-10-05T15:00:00.000Z',answers:[...D.poems.filter(p=>p.stage===1),...D.poems.filter(p=>p.stage===2)].map(p=>({id:p.id,choice:p.source,confidence:4,reason:D.reasons[0],recognized:false}))};}
test('Корпус: 16 разных текстов, 4+4 на каждом этапе, четыре строки',()=>{
 assert.equal(D.poems.length,16);assert.equal(new Set(D.poems.map(p=>p.id)).size,16);
 for(const stage of [1,2])for(const source of ['human','ai'])assert.equal(D.poems.filter(p=>p.stage===stage&&p.source===source).length,4);
 D.poems.forEach(p=>assert.equal(p.text.split('\n').length,4));
});
test('8 из 8 дают 100%, изменение считается в процентных пунктах',()=>{
 const r=record();assert.equal(C.metrics(r).a1,100);assert.equal(C.metrics(r).a2,100);
 r.answers.slice(0,4).forEach(a=>a.choice=a.choice==='human'?'ai':'human');
 assert.equal(C.metrics(r).a1,50);assert.equal(C.metrics(r).delta,50);
});
test('Нет данных — нет выдуманных нулей, исключение всех узнанных даёт null',()=>{
 const r=record();r.answers.forEach(a=>a.recognized=true);assert.equal(C.metrics(r).unrecognized,null);
 assert.equal(C.aggregate([]).a1,null);assert.equal(C.metrics(r).confidenceWrong,null);
});
test('Проверка отвергает повторы, неполный тест, недопустимые ответы, чужой корпус',()=>{
 const r=record();assert.doesNotThrow(()=>C.validateRecord(r));
 for(const change of [r=>r.answers.pop(),r=>r.answers[1]=r.answers[0],r=>r.answers[0].confidence=0,r=>r.version='other',r=>r.answers.reverse()]){const bad=record();change(bad);assert.throws(()=>C.validateRecord(bad));}
});
test('CSV содержит 16 строк ответов, BOM, экранирует кавычки',()=>{
 const csv=C.answersCSV([record()]);assert.equal(csv.charCodeAt(0),0xfeff);assert.equal(csv.split('\r\n').length,17);
 const r=record();r.code='AL-1234567890ABCDEF';assert.match(C.summaryCSV([r]),/AL-1234567890ABCDEF/);
});
test('Перемешивание сохраняет состав, не изменяет исходный массив',()=>{
 const original=['a','b','c','d'],mixed=C.shuffle(original,()=>0);
 assert.deepEqual(original,['a','b','c','d']);assert.deepEqual([...mixed].sort(),[...original].sort());assert.notDeepEqual(mixed,original);
});
test('Средние, медиана и число улучшений считают реальные результаты',()=>{
 const a=record(),b=record();b.code='AL-ABCDEF1234567890';b.answers.slice(8).forEach(x=>x.choice=x.choice==='human'?'ai':'human');
 const s=C.aggregate([a,b]);assert.equal(s.a1,100);assert.equal(s.a2,50);assert.equal(s.delta,-50);assert.equal(s.median,-50);assert.equal(s.declined,1);assert.equal(s.unchanged,1);
});
