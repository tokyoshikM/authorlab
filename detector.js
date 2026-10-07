/* Прозрачный разбор русскоязычного стиха. Никаких сетевых запросов и обученной модели.
   Проценты — вычисленный эвристический индекс, не вероятность истинного авторства. */
const AuthorLabDetector = (() => {
  const corpus=typeof module!=='undefined'?require('./data.js').poems:AuthorLabData.poems;
  const classics=typeof module!=='undefined'?require('./classics.js'):AuthorLabClassics;
  const humanWorks=[...classics,...corpus.filter(p=>p.source==='human')];
  const sourceTokens=text=>(text.toLowerCase().normalize('NFC').replace(/ё/gu,'е').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').match(/[а-я]+/gu)||[]);
  function sourceMatch(text,lineCount) {
    const input=sourceTokens(text);
    let best=null;
    for(const work of humanWorks){
      const ref=sourceTokens(work.text);let length=0;
      // Ищем длинную непрерывную последовательность слов, а не отдельные общие слова.
      for(let i=0;i<input.length;i++)for(let j=0;j<ref.length;j++){
        let n=0;while(i+n<input.length&&j+n<ref.length&&input[i+n]===ref[j+n])n++;
        if(n>length)length=n;
      }
      if(length<10 && !(length>=8&&lineCount>=3))continue;
      const ratio=length/input.length;
      if(!best||ratio>best.ratio||(ratio===best.ratio&&length>best.length))best={work,length,ratio,complete:length===input.length};
    }
    return best;
  }
  const vowels='аеёиоуыэюя', vowelRE=/[аеёиоуыэюя]/giu;
  const matchWords=text => text.toLowerCase().normalize('NFC').match(/[а-яё]+(?:\u0301[а-яё]*)?|[а-яё]+|[a-z]+/giu) || [];
  const clean=word=>word.toLowerCase().replace(/\u0301/g,'').replace(/ё/g,'е');
  const countSyllables=text=>(text.match(vowelRE)||[]).length;
  function rhymeEnding(line) {
    const last=matchWords(line).at(-1)||'';
    if(!last)return '';
    const word=clean(last);
    // Графическое созвучие: упрощённая форма, не фонетическая рифма.
    return word.length<3?word:word.slice(-3);
  }
  const classic=new Set(['сей','очи','взор','чело','рок','уста','ланиты','мгла','лазурь','томленье','златой','длань']);
  const silver=new Set(['символ','призрак','бездна','сумрак','мираж','виденье','экстаз','мерцанье','нездешний','заклятие','тени']);
  const modern=new Set(['метро','экран','пиксель','асфальт','телефон','сеть','сервер','чат','квартал','электричка','уведомление','кофейня']);
  const vague=['душа','любовь','мечта','судьба','надежда','вечность','сердце','тишина'];
  const phrases=['навсегда в моем сердце','наполнится светом','свет моей души','душа моя поет','новый день придет'];
  function era(words) {
    const entries=[['Признаки поэтической лексики XIX века',classic],['Признаки лексики Серебряного века',silver],['Признаки современной городской лексики',modern]];
    const normalized=new Set(words.map(clean));
    const scores=entries.map(([name,terms])=>({name,hits:[...terms].filter(t=>normalized.has(t))})).sort((a,b)=>b.hits.length-a.hits.length);
    const top=scores[0],second=scores[1];
    return {label:top.hits.length>=2&&top.hits.length>second.hits.length?top.name:'Эпоха по этому фрагменту не определяется',hits:top.hits,
      note:'Это словарные подсказки, а не датировка: стили имитируют и переосмысливают.'};
  }
  function stressPattern(lines) {
    // Явные ударения — гласная + U+0301 или буква ё. Без них размер не называем.
    const patterns=[['ямб',[0,1]],['хорей',[1,0]],['дактиль',[1,0,0]],['амфибрахий',[0,1,0]],['анапест',[0,0,1]]];
    const positions=[];let multis=0,annotated=0;
    for(const line of lines){
      let offset=0;
      for(const word of matchWords(line)){
        const units=[...word.normalize('NFC')];
        let local=0,stresses=[];
        for(let i=0;i<units.length;i++){
          const ch=units[i].toLowerCase();
          if(vowels.includes(ch)){
            local++;
            if(ch==='ё'||units[i+1]==='\u0301')stresses.push(offset+local-1);
          }
        }
        if(local>1){multis++;if(stresses.length)annotated++;}
        positions.push(...stresses);offset+=local;
      }
    }
    const coverage=multis?annotated/multis:0;
    if(positions.length<4||coverage<.65)return {name:null,marked:positions.length,coverage,
      note:'Чтобы предположить размер, поставьте знак ударения после ударной гласной в большинстве многосложных слов (например, доро́га). Без разметки доступны слоги по строкам.'};
    const ranked=patterns.map(([name,p])=>({name,fit:Math.max(...p.map((_,shift)=>positions.filter(pos=>p[(pos+shift)%p.length]===1).length/positions.length))})).sort((a,b)=>b.fit-a.fit);
    return {name:ranked[0].fit>=.75&&ranked[0].fit-ranked[1].fit>=.1?`Возможен ${ranked[0].name}`:'Размер остаётся неоднозначным',marked:positions.length,coverage,
      note:'Сопоставлены только вручную обозначенные ударения. Модель не проверяет редукцию, пиррихии и произношение.'};
  }
  function analyze(raw) {
    if(typeof raw!=='string'||raw.length>10000)throw new Error('Введите стихотворение до 10 000 символов.');
    const text=raw.trim();
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(lines.length<2||lines.length>80)throw new Error('Нужно от 2 до 80 непустых строк.');
    const words=matchWords(text),normal=words.map(clean),unique=new Set(normal);
    if(words.filter(w=>/[а-яё]/iu.test(w)).length<4 || words.filter(w=>/[а-яё]/iu.test(w)).length<words.length/2)
      throw new Error('Введите русскоязычный стих с хотя бы четырьмя словами.');
    const syllables=lines.map(countSyllables),endings=lines.map(rhymeEnding);
    const average=syllables.reduce((a,b)=>a+b,0)/syllables.length;
    const range=Math.max(...syllables)-Math.min(...syllables);
    const regularity=syllables.length>=4&&range<=2;
    const rhymePairs=[];
    for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
      if(endings[i].length>=3&&endings[i]===endings[j]&&clean(matchWords(lines[i]).at(-1)||'')!==clean(matchWords(lines[j]).at(-1)||''))rhymePairs.push([i+1,j+1]);
    }
    const pairsAdjacent=rhymePairs.filter(([i,j])=>j===i+1).length;
    const starts=lines.map(l=>clean(matchWords(l)[0]||'')).filter(Boolean);
    const startCounts=starts.reduce((obj,w)=>(obj[w]=(obj[w]||0)+1,obj),{});
    const repeats=Object.entries(startCounts).filter(([w,n])=>w.length>=3&&n>=Math.max(2,Math.ceil(lines.length/2))).map(([w,n])=>({word:w,count:n}));
    const vagueCount=normal.filter(w=>vague.includes(w)).length;
    const foundPhrases=phrases.filter(p=>clean(text).includes(p));
    const ttr=words.length?unique.size/words.length:null;
    const window=20,mattr=words.length>=40?normal.slice(0,words.length-window+1).reduce((sum,_,i)=>sum+new Set(normal.slice(i,i+window)).size/window,0)/(words.length-window+1):null;
    const indicators=[];
    // Ровные строки есть у классических поэтов: используем их в разборе ритма, но не в индексе ИИ.
    if(repeats.length)indicators.push({title:'Повтор начала строк',weight:12,detail:repeats.map(x=>`«${x.word}» — ${x.count}`).join(', ')});
    if(foundPhrases.length)indicators.push({title:'Расхожие выражения',weight:18,detail:foundPhrases.join(', ')});
    if(words.length>=40&&vagueCount/words.length>=.14)indicators.push({title:'Частые общие слова',weight:10,detail:`${vagueCount} из ${words.length} слов входят в короткий список абстрактной лексики.`});
    if(mattr!==null&&mattr<.62)indicators.push({title:'Повторяемость словоформ',weight:10,detail:`Скользящий индекс разнообразия ${Math.round(mattr*100)} % ниже порога 62 % для этой эвристики.`});
    // Коэффициенты заданы вручную, а не обучены на проверочном корпусе.
    // Ограничение 80 % не позволяет слабым сигналам выглядеть доказательством.
    const humanMatch=sourceMatch(text,lines.length);
    const knownAi=corpus.find(p=>p.source==='ai'&&sourceTokens(p.text).join(' ')===sourceTokens(text).join(' '));
    const known=humanMatch?.complete?humanMatch.work:knownAi;
    const quotedSource=humanMatch&&!humanMatch.complete?{
      author:humanMatch.work.author,title:humanMatch.work.title,url:humanMatch.work.url,
      matchedWords:humanMatch.length,totalWords:words.length}:null;
    const rawScore=50+indicators.reduce((sum,item)=>sum+item.weight,0);
    const aiPercent=known?(known.source==='ai'?100:0):Math.min(80,rawScore),humanPercent=100-aiPercent;
    const verdict=known?(known.source==='ai'?'Источник известен: текст из корпуса ИИ':'Найдено произведение известного автора'):
      aiPercent>humanPercent?'По правилам этого прототипа больше признаков ИИ':
      aiPercent<humanPercent?'По правилам этого прототипа больше признаков человека':'Недостаточно признаков для выбора';
    const enough=lines.length>=4&&words.length>=30;
    return {lines:lines.length,words:words.length,unique:unique.size,ttr,mattr,short:words.length<40,
      syllables,average,range,endings,rhymePairs,pairsAdjacent,
      stress:stressPattern(lines),era:era(words),indicators,aiPercent,humanPercent,verdict,rawScore,
      knownSource:known?{id:known.id,source:known.source||'human',author:known.author||null,title:known.title||null,url:known.url||null}:null,
      quotedSource,
      assessment:!enough?'Текста недостаточно для оценки признаков':indicators.length>=2?'Есть несколько признаков, требующих проверки':indicators.length===1?'Найден один неоднозначный признак':'По заданным правилам выраженных признаков не найдено',
      note:known?'Введённый текст совпал с произведением или отрывком из локальной базы. 100 % означает установленный источник этих строк, а не способность определять авторство любого текста.':
        'Проценты — точный результат этой формулы, но не измеренная вероятность реального авторства. На коротком тексте ошибка особенно вероятна.'};
  }
  return {analyze,countSyllables};
})();
if(typeof module!=='undefined')module.exports=AuthorLabDetector;
