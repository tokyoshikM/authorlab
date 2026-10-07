// Проверки логики экранов в Node.js с минимальной имитацией DOM.
// Они не заменяют визуальную проверку в настоящем браузере.
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
function harness(blocked=false){
 const elements=new Map(),store=new Map();
 const query=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',hidden:false,value:'',checked:false,focus(){},scrollIntoView(){}});return elements.get(selector)};
 const context=vm.createContext({document:{querySelector:query},window:{scrollTo(){}},crypto:webcrypto,console,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(blocked)throw Error('blocked');store.set(k,v)},removeItem:k=>store.delete(k)},
 confirm:()=>true,FormData:class {constructor(form){this.fields=form.fields}get(k){return this.fields[k]||null}has(k){return this.fields[k]===true}},
 Blob,URL,setTimeout});
 for(const file of ['data.js','classics.js','core.js','detector.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
 function start(){query('#start-form').onsubmit({preventDefault(){}});}
 function answer(){const id=vm.runInContext('session.order[session.answers.length]',context);const source=vm.runInContext(`C.byId.get('${id}').source`,context);query('#answer-form').onsubmit({preventDefault(){},target:{fields:{choice:source,confidence:'4',reason:'Конкретные детали'}}});}
 return {query,context,start,answer,run:s=>vm.runInContext(s,context)};
}
test('Два этапа, памятка, 16 ответов, сохранение один раз',()=>{
 const h=harness();h.start();
 for(let i=0;i<8;i++)h.answer();
 assert.match(h.query('#app').innerHTML,/МЕЖДУ ДВУМЯ ЭТАПАМИ/);assert.doesNotMatch(h.query('#app').innerHTML,/Пушкин/);
 h.query('#memo-form').onsubmit({preventDefault(){}});for(let i=8;i<16;i++)h.answer();
 assert.match(h.query('#app').innerHTML,/ЭКСПЕРИМЕНТ ЗАВЕРШЁН/);assert.equal(h.run('records.length'),1);assert.equal(h.run('C.metrics(records[0]).a1'),100);assert.equal(h.run('C.metrics(records[0]).a2'),100);
 assert.equal(h.run('read(SESSION)'),null);h.run('research()');assert.equal(h.run('records.length'),1);
});
test('Продолжить позже сохраняет тот же порядок и ответы',()=>{
 const h=harness();h.start();h.answer();const order=h.run('JSON.stringify(session.order)');const code=h.run('session.code');
 h.query('#pause').onclick();assert.match(h.query('#app').innerHTML,/Продолжить сохранённое/);h.query('#resume').onclick();
 assert.equal(h.run('session.answers.length'),1);assert.equal(h.run('JSON.stringify(session.order)'),order);assert.equal(h.run('session.code'),code);
});
test('Повтор JSON не создаёт дубликат; ошибочный файл не добавляет запись',async()=>{
 const h=harness();h.start();for(let i=0;i<8;i++)h.answer();h.query('#memo-form').onsubmit({preventDefault(){}});for(let i=8;i<16;i++)h.answer();
 const json=h.run("JSON.stringify({format:'authorlab-results',version:D.version,records})");h.run('research()');
 await h.query('#import').onchange({target:{files:[{name:'result.json',size:json.length,text:async()=>json}]}});
 assert.equal(h.run('records.length'),1);assert.match(h.query('#import-message').textContent,/Дубликатов: 1/);
 await h.query('#import').onchange({target:{files:[{name:'bad.json',size:3,text:async()=>'bad'}]}});
 assert.equal(h.run('records.length'),1);assert.match(h.query('#import-message').textContent,/bad.json/);
});
test('При запрете записи результат остаётся в памяти и в панели',()=>{
 const h=harness(true);h.start();for(let i=0;i<8;i++)h.answer();h.query('#memo-form').onsubmit({preventDefault(){}});for(let i=8;i<16;i++)h.answer();
 assert.match(h.query('#notice').textContent,/не смог сохранить/);h.run('home(); research();');assert.equal(h.run('records.length'),1);
});

test('Вкладка детектора строит отчёт, не сохраняет введённый стих',()=>{
 const h=harness();h.query('#nav-detector').onclick();assert.match(h.query('#app').innerHTML,/Детектор/);
 h.query('#detector-text').value='Экран мерцает на асфальте\nМолчит ночное метро';
 h.query('#detector-form').onsubmit({preventDefault(){}});
 assert.match(h.query('#detector-report').innerHTML,/современной городской/);
 assert.match(h.query('#detector-report').innerHTML,/ИИ — 50 %/);
 assert.match(h.query('#detector-report').innerHTML,/Человек — 50 %/);
 assert.equal(h.run('records.length'),0);assert.equal(h.run('session'),null);
 assert.doesNotMatch(h.query('#detector-report').innerHTML,/вероятность ИИ: [0-9]/);
});
test('Совпадение известного произведения видно в той же вкладке с источником',()=>{
 const h=harness();h.query('#nav-detector').onclick();
 h.query('#detector-text').value='Я вас любил: любовь ещё, быть может,\nВ душе моей угасла не совсем;\nНо пусть она вас больше не тревожит;';
 h.query('#detector-form').onsubmit({preventDefault(){}});
 const html=h.query('#detector-report').innerHTML;
 assert.match(html,/А. С. Пушкин/);assert.match(html,/Человек — 100 %/);
 assert.match(html,/Открыть источник/);
});
