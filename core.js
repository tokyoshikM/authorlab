// Чистые функции: подсчёт, проверка записей и подготовка CSV.
const AuthorLabCore = (() => {
  const data = typeof module !== 'undefined' ? require('./data.js') : AuthorLabData;
  const byId = new Map(data.poems.map(p => [p.id, p]));
  const mean = values => values.length ? values.reduce((a,b) => a+b,0) / values.length : null;
  const accuracy = answers => answers.length ? answers.filter(a => a.choice === byId.get(a.id).source).length / answers.length * 100 : null;
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length-1; i > 0; i--) {
      const j = Math.floor(random() * (i+1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function validAnswer(a) {
    return a && byId.has(a.id) && ['human','ai'].includes(a.choice) &&
      Number.isInteger(a.confidence) && a.confidence >= 1 && a.confidence <= 5 &&
      data.reasons.includes(a.reason) && typeof a.recognized === 'boolean' &&
      (a.reason !== 'Узнал строку или автора' || a.recognized);
  }
  function validateRecord(r) {
    if (!r || r.version !== data.version || !/^AL-[A-F0-9]{16}$/.test(r.code) ||
        !Number.isFinite(Date.parse(r.finishedAt)) || !Array.isArray(r.answers) || r.answers.length !== 16 ||
        !r.answers.every(validAnswer) || new Set(r.answers.map(a => a.id)).size !== 16 ||
        r.answers.slice(0,8).some(a => byId.get(a.id).stage !== 1) ||
        r.answers.slice(8).some(a => byId.get(a.id).stage !== 2)) throw new Error('Неполная запись или другая версия корпуса.');
    // Не сохраняем лишние поля из импортированного файла.
    return {version:data.version, code:r.code, finishedAt:r.finishedAt,
      answers:r.answers.map(a => ({id:a.id,choice:a.choice,confidence:a.confidence,reason:a.reason,recognized:a.recognized}))};
  }
  function metrics(r) {
    const a1 = accuracy(r.answers.slice(0,8)), a2 = accuracy(r.answers.slice(8));
    const correct = r.answers.filter(a => a.choice === byId.get(a.id).source);
    const wrong = r.answers.filter(a => a.choice !== byId.get(a.id).source);
    return {a1,a2,delta:a2-a1,total:accuracy(r.answers),
      human:accuracy(r.answers.filter(a => byId.get(a.id).source === 'human')),
      ai:accuracy(r.answers.filter(a => byId.get(a.id).source === 'ai')),
      unrecognized:accuracy(r.answers.filter(a => !a.recognized)),
      confidenceCorrect:mean(correct.map(a => a.confidence)), confidenceWrong:mean(wrong.map(a => a.confidence))};
  }
  function aggregate(records) {
    const scores = records.map(metrics);
    const values = records.flatMap(r => r.answers);
    const sorted = scores.map(s => s.delta).sort((a,b) => a-b);
    return {count:records.length,a1:mean(scores.map(s=>s.a1)),a2:mean(scores.map(s=>s.a2)),
      delta:mean(sorted),median:sorted.length ? (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2 : null,
      min:sorted.length ? sorted[0] : null,max:sorted.length ? sorted.at(-1) : null,
      improved:scores.filter(s=>s.delta>0).length,declined:scores.filter(s=>s.delta<0).length,unchanged:scores.filter(s=>s.delta===0).length,
      unrecognized:accuracy(values.filter(a=>!a.recognized)),human:accuracy(values.filter(a=>byId.get(a.id).source==='human')),
      ai:accuracy(values.filter(a=>byId.get(a.id).source==='ai')),
      confidenceCorrect:mean(values.filter(a=>a.choice===byId.get(a.id).source).map(a=>a.confidence)),
      confidenceWrong:mean(values.filter(a=>a.choice!==byId.get(a.id).source).map(a=>a.confidence))};
  }
  // CSV с BOM, разделителем ; и защитой от формул в табличном редакторе.
  function cell(value) {
    let s = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g,'""') + '"';
  }
  function csv(rows) {return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');}
  function summaryCSV(records) {
    return csv([['Код','Дата','Версия','A1, %','A2, %','Изменение, п.п.','Человек, %','ИИ, %','Без узнавания, %','Уверенность верных','Уверенность ошибок'],
      ...records.map(r=>{const m=metrics(r);return [r.code,r.finishedAt,r.version,m.a1,m.a2,m.delta,m.human,m.ai,m.unrecognized,m.confidenceCorrect,m.confidenceWrong];})]);
  }
  function answersCSV(records) {
    return csv([['Код','Версия','Этап','Порядок в этапе','Фрагмент','Источник','Ответ','Верно','Уверенность','Причина','Узнал'],
      ...records.flatMap(r=>r.answers.map((a,i)=>[r.code,r.version,byId.get(a.id).stage,i%8+1,a.id,byId.get(a.id).source,a.choice,a.choice===byId.get(a.id).source?1:0,a.confidence,a.reason,a.recognized?1:0]))]);
  }
  return {shuffle,validAnswer,validateRecord,metrics,aggregate,summaryCSV,answersCSV,byId};
})();
if (typeof module !== 'undefined') module.exports = AuthorLabCore;
