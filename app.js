const D = AuthorLabData, C = AuthorLabCore;

const app = document.querySelector("#app");

const STORE = `authorlab.records.${D.version}`, SESSION = `authorlab.session.${D.version}`;

let memory = new Map, storageOK = true, session = null, records = [], viewVersion = 0;

let disposeView = () => {};

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

const number = n => n == null ? "—" : n.toLocaleString("ru-RU", {
    maximumFractionDigits: 1
});

const signed = n => n == null ? "—" : (n > 0 ? "+" : "") + number(n);

function notice(message) {
    const el = document.querySelector("#notice");
    el.textContent = message;
    el.hidden = false;
}

function read(key) {
    if (!storageOK && memory.has(key)) return memory.get(key);
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
        storageOK = false;
        return memory.get(key) || null;
    }
}

function write(key, value) {
    memory.set(key, value);
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        storageOK = false;
        notice("Браузер не смог сохранить данные. Скачайте файл результата перед закрытием страницы.");
    }
}

function remove(key) {
    memory.delete(key);
    try {
        localStorage.removeItem(key);
    } catch {
        storageOK = false;
    }
}

function loadRecords() {
    const raw = read(STORE);
    if (raw === null) return [];
    if (!Array.isArray(raw)) {
        notice("Сохранённые данные повреждены. Не очищайте браузер; используйте резервную копию JSON.");
        return [];
    }
    const result = [], codes = new Set;
    let invalid = 0;
    for (const item of raw) {
        try {
            const r = C.validateRecord(item);
            if (!codes.has(r.code)) {
                result.push(r);
                codes.add(r.code);
            }
        } catch {
            invalid++;
        }
    }
    if (invalid) notice("Некоторые сохранённые записи не прошли проверку и не включены в сводку.");
    return result;
}

function validSession(s) {
    if (!s || s.version !== D.version || !/^AL-[A-F0-9]{16}$/.test(s.code) || !Array.isArray(s.order) || s.order.length !== 16 || new Set(s.order).size !== 16 || s.order.some((id, i) => !C.byId.has(id) || C.byId.get(id).stage !== (i < 8 ? 1 : 2)) || !Array.isArray(s.answers) || s.answers.length > 16 || !s.answers.every((a, i) => C.validAnswer(a) && a.id === s.order[i]) || typeof s.memoRead !== "boolean") return false;
    return s.answers.length <= 8 || s.memoRead;
}

function show(html) {
    disposeView();
    disposeView = () => {};
    viewVersion++;
    app.innerHTML = html;
    app.focus({
        preventScroll: true
    });
    window.scrollTo(0, 0);
}

function button(id, text, secondary = false) {
    return `<button id="${id}" class="button ${secondary ? "secondary" : ""}" type="button">${text}</button>`;
}

function newCode() {
    let code;
    do {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        code = "AL-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    } while (records.some(r => r.code === code));
    return code;
}

function home() {
    session = read(SESSION);
    if (session && !validSession(session)) {
        notice("Незавершённое прохождение повреждено. Начните новое прохождение.");
        session = null;
    }
    show(`<section class="hero"><div><p class="eyebrow">ЧЕЛОВЕК ИЛИ ИСКУССТВЕННЫЙ ИНТЕЛЛЕКТ?</p><h1>У стихотворения<br>есть автор.<br><em>Сможете его узнать?</em></h1><p class="lead">16 стихотворений и фрагментов. Два этапа. Один эксперимент о том, как мы читаем и принимаем решения.</p><div class="chips"><span>10–15 минут</span><span>Анонимно</span><span>Без оценки</span></div></div><div class="hero-art" aria-hidden="true"><span class="art-label">АвторLab / 01</span><span class="quote-mark">“</span><p>Внимание к слову.<br>Вопрос к образу.<br>Свой ответ.</p><span class="art-line"></span><span class="art-bottom">ЧТЕНИЕ КАК ИССЛЕДОВАНИЕ</span></div></section>\n  <section class="steps"><div><b>01</b><span>Первое впечатление<small>8 фрагментов без подсказок</small></span></div><div><b>02</b><span>Лингвистическая памятка<small>Вопросы к тексту</small></span></div><div><b>03</b><span>Внимательное чтение<small>8 новых фрагментов</small></span></div></section>\n  <section class="card start-card"><div><p class="eyebrow">ПЕРЕД НАЧАЛОМ</p><h2>Попробуйте определить источник</h2><p>Часть фрагментов написана русскими поэтами, часть создана ИИ. Для каждого выберите источник, уверенность и главную причину. Не ищите строки в интернете и не обсуждайте ответы.</p><p class="muted">Имя указывать не нужно. Ответы используются только для анализа эксперимента.</p></div><form id="start-form"><label class="check"><input id="consent" type="checkbox" required><span>Участвую добровольно и согласен(на) на использование анонимных ответов в обобщённом виде.</span></label><button class="button" type="submit">Начать эксперимент <span>→</span></button>${session ? button("resume", "Продолжить сохранённое прохождение", true) : ""}</form></section>\n  <div class="bottom-row"><p>Ни один языковой признак не доказывает авторство сам по себе.</p>${button("research", "Панель исследователя", true)}</div>`);
    document.querySelector("#start-form").onsubmit = e => {
        e.preventDefault();
        if (session && !confirm("Начать заново? Незавершённые ответы будут заменены.")) return;
        session = {
            version: D.version,
            code: newCode(),
            memoRead: false,
            answers: [],
            order: [ ...C.shuffle(D.poems.filter(p => p.stage === 1).map(p => p.id)), ...C.shuffle(D.poems.filter(p => p.stage === 2).map(p => p.id)) ]
        };
        write(SESSION, session);
        route();
    };
    document.querySelector("#research").onclick = () => research();
    if (session) document.querySelector("#resume").onclick = route;
}

function route() {
    if (session.answers.length === 16) finish(); else if (session.answers.length === 8 && !session.memoRead) memo(); else question();
}

function question() {
    const i = session.answers.length, stage = i < 8 ? 1 : 2, poem = C.byId.get(session.order[i]);
    show(`<div class="test-top"><span class="eyebrow">ЭТАП ${stage} / ${stage === 1 ? "ДО ПАМЯТКИ" : "ПОСЛЕ ПАМЯТКИ"}</span><span class="muted">Фрагмент ${i % 8 + 1} из 8</span></div><div class="progress" role="progressbar" aria-label="Выполнено заданий" aria-valuemin="0" aria-valuemax="16" aria-valuenow="${i}"><span style="width:${i / 16 * 100}%"></span></div>\n  <div class="question-grid"><section class="poem-card"><span class="eyebrow">ПРОЧИТАЙТЕ ФРАГМЕНТ</span><span class="poem-quote" aria-hidden="true">“</span><h1 class="sr-only">Фрагмент ${i % 8 + 1}</h1><p class="poem">${escapeHTML(poem.text)}</p><p class="poem-caption">Прочитайте не только рифму, но и смысл.</p></section>\n  <form id="answer-form" class="card answer-card"><fieldset><legend>Кто создал этот текст?</legend><div class="choices"><label><input type="radio" name="choice" value="human" required><span>Человек</span></label><label><input type="radio" name="choice" value="ai" required><span>Искусственный интеллект</span></label></div></fieldset>\n  <fieldset><legend>Насколько вы уверены?</legend><div class="confidence">${[ 1, 2, 3, 4, 5 ].map(n => `<label><input type="radio" name="confidence" value="${n}" required><span>${n}</span></label>`).join("")}</div><div class="scale-labels"><span>Предполагаю</span><span>Полностью уверен(а)</span></div></fieldset>\n  ${stage === 2 ? `<label for="reason">Главная причина выбора</label><select id="reason" name="reason" required><option value="">Выберите причину</option>${D.reasons.map(r => `<option>${r}</option>`).join("")}</select>` : ""}<label class="check"><input type="checkbox" name="recognized" id="recognized"><span>Узнал(а) строку или автора</span></label><button class="button" type="submit">${i === 7 ? "Перейти к памятке" : i === 15 ? "Завершить эксперимент" : "Следующий фрагмент"} <span>→</span></button><p class="muted small">Правильные ответы не показываются между этапами.</p></form></div><div class="bottom-row"><span class="muted small">Ваш код: ${session.code}</span>${button("pause", "Продолжить позже", true)}</div>`);
    if (stage === 2) document.querySelector("#reason").onchange = e => {
        if (e.target.value === "Возможное узнавание знакомых строк") document.querySelector("#recognized").checked = true;
    };
    document.querySelector("#answer-form").onsubmit = e => {
        e.preventDefault();
        const form = new FormData(e.target);
        const answer = {
            id: poem.id,
            choice: form.get("choice"),
            confidence: Number(form.get("confidence")),
            reason: form.get("reason") || null,
            recognized: form.has("recognized")
        };
        if (!C.validAnswer(answer)) {
            notice("Если причиной было узнавание, отметьте «Узнал(а) строку или автора».");
            return;
        }
        session.answers.push(answer);
        write(SESSION, session);
        route();
    };
    document.querySelector("#pause").onclick = () => {
        write(SESSION, session);
        home();
    };
}

function memo() {
    show(`<section class="memo-header"><p class="eyebrow">МЕЖДУ ДВУМЯ ЭТАПАМИ</p><h1>От впечатления<br>к наблюдению.</h1><p class="lead">Первый этап завершён. Перед новым набором прочитайте памятку: она помогает задавать вопросы, а не угадывать по одному признаку.</p></section><div class="memo-grid">${D.memo.map(([title, text], i) => `<article class="card"><span class="memo-number">0${i + 1}</span><h2>${title}</h2><p>${text}</p></article>`).join("")}</div><div class="callout"><b>Признак — ещё не доказательство.</b><p>И человек, и ИИ могут использовать ровную рифму, клише или неожиданный образ. Рассматривайте признаки вместе.</p></div><form id="memo-form" class="memo-action"><label class="check"><input type="checkbox" required><span>Я прочитал(а) памятку и готов(а) к восьми новым фрагментам.</span></label><button class="button" type="submit">Начать второй этап →</button></form>`);
    document.querySelector("#memo-form").onsubmit = e => {
        e.preventDefault();
        session.memoRead = true;
        write(SESSION, session);
        question();
    };
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([ content ], {
        type: type
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
}

function exportJSON(list, name) {
    download(name, JSON.stringify({
        format: "authorlab-results",
        version: D.version,
        records: list
    }, null, 2), "application/json");
}

function finish() {
    const record = C.validateRecord({
        ...session,
        finishedAt: (new Date).toISOString()
    });
    records = loadRecords();
    const existing = records.find(r => r.code === record.code);
    if (!existing) {
        records.push(record);
        write(STORE, records);
    }
    const final = existing || record;
    remove(SESSION);
    session = null;
    result(final);
}

function statsCards(items) {
    return `<div class="stats">${items.map(([label, value, unit]) => `<div class="card stat"><span>${label}</span><strong>${value}<small>${unit || ""}</small></strong></div>`).join("")}</div>`;
}

function result(r) {
    const m = C.metrics(r);
    show(`<section class="result-header"><p class="eyebrow">ЭКСПЕРИМЕНТ ЗАВЕРШЁН</p><h1>Спасибо за<br><em>внимательное чтение.</em></h1><p class="lead">Это результат на данном наборе фрагментов. Результат относится только к этому набору стихотворений.</p></section>${statsCards([ [ "До памятки", number(m.a1), "%" ], [ "После памятки", number(m.a2), "%" ], [ "Изменение", signed(m.delta), " п.п." ] ])}<section class="card"><h2>Что изменилось?</h2><p>${m.delta > 0 ? "Во втором этапе ваша точность выросла." : m.delta < 0 ? "Во втором этапе ваша точность снизилась." : "Точность двух этапов совпала."} Разница может зависеть и от сложности фрагментов. По одному прохождению нельзя доказать полезность памятки.</p><p>Без узнанных строк: <b>${number(m.unrecognized)}${m.unrecognized === null ? "" : " %"}</b>. Верно распознано человеческих текстов: ${number(m.human)} %, текстов ИИ: ${number(m.ai)} %.</p><p class="muted">${storageOK ? "Результат сохранён в этом браузере." : "Результат доступен в памяти страницы. Обязательно скачайте его."} Для передачи исследователю скачайте JSON. Источники будут обсуждаться после завершения общего сбора.</p><div class="toolbar">${button("personal-json", "Скачать результат JSON")}${button("personal-csv", "Скачать 16 ответов CSV", true)}${button("home", "На главную", true)}</div><p class="muted small">Код: ${r.code}</p></section>`);
    document.querySelector("#personal-json").onclick = () => exportJSON([ r ], `authorlab-${r.code}.json`);
    document.querySelector("#personal-csv").onclick = () => download(`authorlab-${r.code}.csv`, C.answersCSV([ r ]), "text/csv;charset=utf-8");
    document.querySelector("#home").onclick = home;
}

function research() {
    records = loadRecords();
    const selected = records, s = C.aggregate(selected);
    show(`<div class="bottom-row"><p class="eyebrow">ПАНЕЛЬ ИССЛЕДОВАТЕЛЯ</p>${button("home", "На главную", true)}</div><h1 class="panel-title">От ответов<br>к результатам.</h1><div class="callout"><b>Данные этого браузера</b></div><div class="toolbar"><label class="button secondary upload">Импорт JSON<input id="import" type="file" accept=".json,application/json" multiple></label>${button("backup", "Резервная копия всех записей", true)}</div><p id="import-message" role="status"></p>\n  ${statsCards([ [ "Завершено", s.count, "" ], [ "Средняя A₁", number(s.a1), "%" ], [ "Средняя A₂", number(s.a2), "%" ], [ "Среднее изменение", signed(s.delta), " п.п." ] ])}\n  <section class="card"><h2>Сравнение этапов</h2><div class="bar-row"><span>До памятки</span><div class="bar"><span style="width:${s.a1 || 0}%"></span></div><b>${number(s.a1)} %</b></div><div class="bar-row"><span>После памятки</span><div class="bar"><span style="width:${s.a2 || 0}%"></span></div><b>${number(s.a2)} %</b></div><p>Выросла: <b>${s.improved}</b> · Снизилась: <b>${s.declined}</b> · Не изменилась: <b>${s.unchanged}</b></p><p class="muted">Медиана изменения: ${signed(s.median)} п.п. · Диапазон: ${number(s.min)}…${number(s.max)} п.п.</p><p class="muted">${s.count < 30 ? "Для исследования желательно не менее 30 участников. Небольшую выборку описывайте осторожно." : "Показатели описывают эту выборку; причинный эффект памятки не доказан."}</p></section>\n  <section class="card"><h2>Дополнительные показатели</h2><div class="detail-grid"><p>Человеческие тексты<b>${number(s.human)} %</b></p><p>Тексты ИИ<b>${number(s.ai)} %</b></p><p>Без узнанных строк<b>${number(s.unrecognized)}${s.unrecognized === null ? "" : " %"}</b></p><p>Уверенность верных ответов<b>${number(s.confidenceCorrect)} / 5</b></p><p>Уверенность ошибок<b>${number(s.confidenceWrong)} / 5</b></p></div></section>\n  <section class="card"><h2>Причины выбора</h2><div class="table-scroll"><table><thead><tr><th>Причина</th><th>Ответов</th><th>Верно, %</th></tr></thead><tbody>${D.reasons.map(reason => {
        const answers = selected.flatMap(r => r.answers).filter(a => a.reason === reason);
        const correct = answers.filter(a => a.choice === C.byId.get(a.id).source).length;
        return `<tr><td>${reason}</td><td>${answers.length}</td><td>${answers.length ? number(correct / answers.length * 100) : "—"}</td></tr>`;
    }).join("")}<tr><td>Старые формулировки</td><td>${selected.flatMap(r => r.answers).filter(a => a.reason && !D.reasons.includes(a.reason)).length}</td><td>—</td></tr><tr><td>Не указана (этап 1)</td><td>${selected.flatMap(r => r.answers).filter(a => C.byId.get(a.id).stage === 1 && !a.reason).length}</td><td>—</td></tr></tbody></table></div></section>\n  <section class="card"><div class="bottom-row"><h2>Завершённые прохождения</h2><div class="toolbar">${button("summary", "Сводка CSV", true)}${button("answers", "Все ответы CSV", true)}</div></div><div class="table-scroll"><table><thead><tr><th>Код</th><th>A₁, %</th><th>A₂, %</th><th>ΔA, п.п.</th></tr></thead><tbody>${selected.map(r => {
        const m = C.metrics(r);
        return `<tr><td class="code">${escapeHTML(r.code)}</td><td>${number(m.a1)}</td><td>${number(m.a2)}</td><td>${signed(m.delta)}</td></tr>`;
    }).join("") || '<tr><td colspan="4">Пока нет завершённых прохождений. Данные не заполняются примерами.</td></tr>'}</tbody></table></div></section>\n  <section class="card"><h2>Разбор источников</h2>${button("key", "Показать ключ после сбора", true)}<div id="key-content" hidden></div></section>`);
    document.querySelector("#home").onclick = home;
    document.querySelector("#backup").onclick = () => exportJSON(records, "authorlab-backup.json");
    document.querySelector("#summary").onclick = () => download("authorlab-summary.csv", C.summaryCSV(selected), "text/csv;charset=utf-8");
    document.querySelector("#answers").onclick = () => download("authorlab-answers.csv", C.answersCSV(selected), "text/csv;charset=utf-8");
    document.querySelector("#key").onclick = () => {
        if (!confirm("Общий сбор данных завершён? Ключ раскроет источники всех фрагментов.")) return;
        const el = document.querySelector("#key-content");
        el.hidden = false;
    el.innerHTML = D.poems.map(p => `<article class="key-item"><b>${p.id} · ${p.source === "human" ? "Человек — " + escapeHTML(p.title) : "Сгенерировано ИИ для этой версии"}</b><p class="key-poem">${escapeHTML(p.text)}</p>${p.url ? `<a href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer">Источник текста ↗</a>` : ""}</article>`).join("");
    };
    document.querySelector("#import").onchange = async e => {
        let added = 0, duplicates = 0, conflicts = 0;
        const errors = [];
        records = loadRecords();
        for (const file of e.target.files) {
            try {
                if (file.size > 5 * 1024 * 1024) throw new Error("Файл больше 5 МБ.");
                const data = JSON.parse(await file.text());
                if (data.format !== "authorlab-results" || data.version !== D.version || !Array.isArray(data.records) || data.records.length > 1e3) throw new Error("Неизвестный формат или версия.");
                const incoming = data.records.map(C.validateRecord);
                for (const r of incoming) {
                    const found = records.find(old => old.code === r.code);
                    if (found) {
                        if (JSON.stringify(found) === JSON.stringify(r)) duplicates++; else conflicts++;
                    } else {
                        records.push(r);
                        added++;
                    }
                }
            } catch (error) {
                errors.push(file.name + ": " + error.message);
            }
        }
        if (added) write(STORE, records);
        research();
        document.querySelector("#import-message").textContent = `Добавлено: ${added}. Дубликатов: ${duplicates}. Конфликтов кода (оставлены прежние записи): ${conflicts}. ${errors.join(" ")}`;
    };
}

function detector() {
    show(`<div class="detector-intro"><p class="eyebrow">ИНСТРУМЕНТ ДЛЯ АНАЛИЗА ПОЭЗИИ</p><h1>Детектор<br><em>и разбор стиха.</em></h1><p class="lead">Узнайте, кем могло быть написано русскоязычное стихотворение — человеком или ИИ.</p></div>\n    <form id="detector-form" class="card detector-form">\n      <div class="detector-input-header"><label for="detector-text">Стихотворение (от 2 до 80 строк)</label><div class="detector-examples"><button id="example-human" type="button">Пример автора</button><button id="example-ai" type="button">Пример ИИ</button></div></div>\n      <textarea id="detector-text" rows="11" maxlength="10000" required placeholder="Вставьте стихотворение целиком…"></textarea>\n      <p class="muted small">Длинные стихотворения проверяются по началу текста.</p>\n      <p id="detector-status" class="detector-status" role="status" hidden></p>\n      <button id="detector-submit" class="button" type="submit">Проверить стих →</button><p id="detector-error" role="alert" class="error" hidden></p>\n    </form><div id="detector-report" aria-live="polite"></div>`);
    const version = viewVersion;
    const active = () => version === viewVersion;
    const form = document.querySelector("#detector-form");
    const submit = document.querySelector("#detector-submit");
    const error = document.querySelector("#detector-error");
    const report = document.querySelector("#detector-report");
    const status = document.querySelector("#detector-status");
    let busy = false, controller;
    disposeView = () => controller?.abort();
    function sync() {
        submit.disabled = busy;
        submit.textContent = busy ? "Проверяем стихотворение…" : "Проверить стих →";
        document.querySelector("#detector-text").readOnly = busy;
        document.querySelector("#example-human").disabled = busy;
        document.querySelector("#example-ai").disabled = busy;
        status.hidden = !busy;
    }
    function insertExample(text) {
        document.querySelector("#detector-text").value = text;
        error.hidden = true;
        report.innerHTML = "";
    }
    document.querySelector("#example-human").onclick = () => insertExample(AuthorLabClassics.find(poem => poem.id === "P1").text);
    document.querySelector("#example-ai").onclick = () => insertExample(D.poems.find(poem => poem.id === "A1").text);
    form.onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        error.hidden = true;
        report.innerHTML = "";
        const text = document.querySelector("#detector-text").value;
        try {
            const analysis = AuthorLabDetector.analyze(text);
            busy = true;
            sync();
            controller = new AbortController;
            const score = await AuthorLabAPI.analyze(text, {
                signal: controller.signal,
                onStatus: message => {
                    if (active()) status.textContent = message;
                }
            });
            if (!active()) return;
            const ai = Math.round(score.ai * 1e3) / 10, human = Math.round((100 - ai) * 10) / 10;
            const verdict = score.label === "ai" ? "Скорее создано искусственным интеллектом" : score.label === "human" ? "Скорее написано человеком" : "Скорее создано ИИ";
            const source = analysis.knownSource || analysis.quotedSource;
            const sourceNote = source ? `<section class="card"><h2>${analysis.knownSource ? "Найдено совпадение с произведением" : "В тексте найдена цитата"}</h2><p>${source.author ? escapeHTML(source.author) + ", " : ""}«${escapeHTML(source.title)}».</p>${source.url ? `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>` : ""}<p class="muted small">Найденный источник показан отдельно от результата проверки.</p></section>` : "";
            const rows = analysis.syllables.map((count, index) => `<tr><td>${index + 1}</td><td>${count}</td><td>${escapeHTML(analysis.endings[index] || "—")}</td></tr>`).join("");
            const observations = analysis.indicators.length ? analysis.indicators.map(item => `<li><b>${escapeHTML(item.title)}</b> — ${escapeHTML(item.detail)}</li>`).join("") : "<li>Выраженных повторов и словарных шаблонов не найдено.</li>";
            report.innerHTML = `<section class="card detector-verdict"><p class="eyebrow">РЕЗУЛЬТАТ ПРОВЕРКИ</p><h2>${verdict}</h2><div class="verdict-row"><b>ИИ — ${number(ai)} %</b><div class="verdict-bar"><span style="width:${ai}%"></span></div></div><div class="verdict-row human"><b>Человек — ${number(human)} %</b><div class="verdict-bar"><span style="width:${human}%"></span></div></div><p class="muted small">Детектор может ошибаться.</p>${score.label === "uncertain" ? "<p>Полученных признаков недостаточно для уверенного вывода.</p>" : ""}${analysis.words < 30 ? '<p class="callout">Фрагмент содержит меньше 30 слов. Для более содержательной проверки вставьте стихотворение целиком.</p>' : ""}</section>\n        ${sourceNote}\n        <section class="card"><p class="eyebrow">АНАЛИТИЧЕСКИЙ ОТЧЁТ</p><h2>${escapeHTML(analysis.assessment)}</h2><p class="muted small">Ниже приведены наблюдения о языке и структуре текста.</p></section>\n        ${statsCards([ [ "Строк", analysis.lines, "" ], [ "Слов", analysis.words, "" ], [ "Уникальных слов", analysis.unique, "" ], [ "Лексическое разнообразие", number(analysis.ttr * 100), " %" ] ])}\n        <section class="card"><h2>Ритм и рифма</h2><p>Слогов в строках: <b>${analysis.syllables.join(" · ")}</b>. Среднее: ${number(analysis.average)}; разброс: ${analysis.range}.</p><p>Совпадения последних букв в окончаниях: ${analysis.rhymePairs.length ? analysis.rhymePairs.map(pair => pair.join("–")).join(", ") : "не обнаружены"}.</p><p><b>${escapeHTML(analysis.stress.name || "Размер по ударениям не определяется")}</b>. ${escapeHTML(analysis.stress.note)}</p><p class="muted small">Окончания сопоставляются по написанию, а не по звучанию.</p><div class="table-scroll"><table><thead><tr><th>Строка</th><th>Слогов</th><th>Окончание</th></tr></thead><tbody>${rows}</tbody></table></div></section>\n        <section class="card"><h2>Лексическое разнообразие</h2><p>Уникальных словоформ: ${analysis.unique} из ${analysis.words}. Лексическое разнообразие: <b>${number(analysis.ttr * 100)} %</b>.</p><p>${analysis.mattr === null ? "Для скользящего индекса нужно не менее 40 слов." : `Скользящий индекс MATTR-20: <b>${number(analysis.mattr * 100)} %</b>.`}</p><p class="muted small">Формы одного слова считаются отдельно: «свет» и «света» — разные словоформы.</p></section>\n        <section class="card"><h2>Стилистическая эпоха</h2><p><b>${escapeHTML(analysis.era.label)}</b></p><p>Слова-маркеры: ${analysis.era.hits.length ? analysis.era.hits.map(escapeHTML).join(", ") : "не обнаружены"}.</p><p class="muted small">${escapeHTML(analysis.era.note)}</p></section>\n        <section class="card"><h2>Повторы и словарные шаблоны</h2><ul class="signal-list">${observations}</ul><p class="muted small">Такие особенности встречаются и у людей, и у нейросетей. Они приведены для литературного разбора.</p></section>`;
            report.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        } catch (failure) {
            if (active() && failure.name !== "AbortError") {
                error.textContent = failure.message;
                error.hidden = false;
                report.innerHTML = "";
            }
        } finally {
            busy = false;
            if (active()) sync();
        }
    };
}

document.querySelector("#nav-home").onclick = home;

document.querySelector("#nav-detector").onclick = detector;

document.querySelector("#nav-research").onclick = research;

records = loadRecords();

if (!storageOK) notice("Постоянное сохранение недоступно. Скачивайте результаты перед закрытием страницы.");

home();
