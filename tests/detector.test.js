const test=require('node:test'),assert=require('node:assert/strict');
const Detector=require('../detector.js');
const Data=require('../data.js');
const Classics=require('../classics.js');
test('Слоги и словоформы считаются, ударения без разметки не угадываются',()=>{
 const a=Detector.analyze('Мама мыла раму\nРаму мыла мама');
 assert.deepEqual(a.syllables,[6,6]);assert.equal(a.words,6);assert.equal(a.unique,3);
 assert.equal(a.ttr,.5);assert.equal(a.mattr,null);assert.equal(a.stress.name,null);
 assert.match(a.assessment,/недостаточно/);
});
test('Ручная разметка ударений влияет на доступность ритмического разбора',()=>{
 const a=Detector.analyze('В саду́ звени́т весе́нний ве́тер,\nНа берегу́ молчи́т вода́.');
 assert.equal(a.stress.marked,7);assert.equal(a.stress.coverage,1);
 assert.ok(a.stress.name!==null);
});
test('Эпоха называется только при нескольких отличительных словах, без датировки',()=>{
 assert.match(Detector.analyze('Экран мерцает на асфальте\nМолчит ночное метро').era.label,/современной/);
 assert.match(Detector.analyze('Свет гаснет в окне\nИ дождь уже идёт').era.label,/не определяется/);
});
test('Повторы и клише показаны как признаки, без вероятности ИИ',()=>{
 const a=Detector.analyze('Душа моя поет и свет моей души приходит\nДуша опять встречает свет и новый день придет\nДуша приходит вновь и новый день придет\nДуша встречает свет и сердце его ждёт');
 assert.ok(a.indicators.length>=2);assert.doesNotMatch(a.assessment,/\d+\s*%/);
 assert.equal(a.aiPercent+a.humanPercent,100);
 assert.equal(a.aiPercent,Math.min(80,50+a.indicators.reduce((sum,x)=>sum+x.weight,0)));
 assert.match(a.verdict,/ИИ/);
});
test('Проценты сравниваются, отсутствие сигналов даёт честную ничью',()=>{
 const a=Detector.analyze('Свет гаснет в окне\nИ дождь уже идёт');
 assert.equal(a.aiPercent,50);assert.equal(a.humanPercent,50);
 assert.match(a.verdict,/Недостаточно/);
 const b=Detector.analyze('Мечта наполнится светом поутру\nМечта наполнится светом опять\nМечта наполнится светом и ночью\nМечта наполнится светом всегда');
 assert.equal(b.aiPercent,80);assert.equal(b.humanPercent,20);
});
test('Для точного совпадения известен источник, новый стих оценивается формулой',()=>{
 const human=Detector.analyze(Data.poems.find(p=>p.id==='H1').text);
 const ai=Detector.analyze(Data.poems.find(p=>p.id==='A1').text);
 assert.equal(human.humanPercent,100);assert.equal(ai.aiPercent,100);
 assert.equal(human.knownSource.id,'H1');assert.equal(ai.knownSource.id,'A1');
 assert.equal(Detector.analyze('Звучит велосипед у дома\nИ пахнет свежестью трава').knownSource,null);
});
test('Известный стих и отрывок распознаются до эвристики, источник открывается',()=>{
 const p=Classics.find(x=>x.id==='P2');
 const full=Detector.analyze(p.text);
 assert.equal(full.knownSource.author,'А. С. Пушкин');assert.equal(full.humanPercent,100);
 const fragment=Detector.analyze('Мороз и солнце, день чудесный!\nЕщё ты дремлешь, друг прелестный —\nПора, красавица, проснись!');
 assert.equal(fragment.knownSource.title,'Зимнее утро');assert.equal(fragment.aiPercent,0);
 assert.equal(fragment.knownSource.url,p.url);
});
test('Совпадение цитаты внутри другого текста не приписывает весь текст поэту',()=>{
 const text='Мороз и солнце, день чудесный!\nЕще ты дремлешь, друг прелестный —\nПора, красавица, проснись!\n'+Array(5).fill('Новая строка о далёком городе и море').join('\n');
 const a=Detector.analyze(text);
 assert.equal(a.knownSource,null);assert.equal(a.quotedSource.author,'А. С. Пушкин');
 assert.notEqual(a.humanPercent,100);
});
test('Произведение с ё в базе узнаётся с е во вводе',()=>{
 const a=Detector.analyze('Белая береза\nПод моим окном\nПринакрылась снегом,\nТочно серебром.');
 assert.equal(a.knownSource.author,'С. А. Есенин');
});
test('Скользящий индекс доступен лишь для более длинного текста',()=>{
 const line='Солнце тихо светит над рекою в поле за зелёным лугом';
 const a=Detector.analyze(Array(4).fill(line).join('\n'));
 assert.equal(a.words,40);assert.ok(a.mattr>=0&&a.mattr<=1);
});
test('Границы длины отклоняют пустой, одну строку и слишком большой текст',()=>{
 for(const t of ['', 'Одна строка','!!!\n???','english words only\nin both lines',Array(81).fill('строка').join('\n'), 'а'.repeat(10001)+'\nб'])assert.throws(()=>Detector.analyze(t));
});
