const test = require("node:test"), assert = require("node:assert/strict");

const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");

const {webcrypto: webcrypto} = require("node:crypto");

function harness(blocked = false) {
    const elements = new Map, store = new Map;
    const query = selector => {
        if (!elements.has(selector)) elements.set(selector, {
            innerHTML: "",
            textContent: "",
            hidden: false,
            value: "",
            checked: false,
            focus() {},
            scrollIntoView() {}
        });
        return elements.get(selector);
    };
    const context = vm.createContext({
        document: {
            querySelector: query
        },
        window: {
            scrollTo() {}
        },
        crypto: webcrypto,
        console: console,
        localStorage: {
            getItem: k => store.get(k) || null,
            setItem: (k, v) => {
                if (blocked) throw Error("blocked");
                store.set(k, v);
            },
            removeItem: k => store.delete(k)
        },
        confirm: () => true,
        FormData: class {
            constructor(form) {
                this.fields = form.fields;
            }
            get(k) {
                return this.fields[k] || null;
            }
            has(k) {
                return this.fields[k] === true;
            }
        },
        Blob: Blob,
        URL: URL,
        AbortController: AbortController,
        setTimeout: setTimeout,
        AuthorLabAPI: {
            async analyze() {
                return {
                    ai: .83,
                    human: .17,
                    label: "ai",
                    threshold: .8
                };
            }
        }
    });
    for (const file of [ "data.js", "classics.js", "core.js", "detector.js", "app.js" ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, {
        filename: file
    });
    function start() {
        query("#start-form").onsubmit({
            preventDefault() {}
        });
    }
    function answer() {
        const id = vm.runInContext("session.order[session.answers.length]", context);
        const stage = vm.runInContext(`C.byId.get('${id}').stage`, context);
        const source = vm.runInContext(`C.byId.get('${id}').source`, context);
        query("#answer-form").onsubmit({
            preventDefault() {},
            target: {
                fields: {
                    choice: source,
                    confidence: "4",
                    reason: stage === 1 ? null : "Конкретные детали"
                }
            }
        });
    }
    return {
        query: query,
        context: context,
        start: start,
        answer: answer,
        run: s => vm.runInContext(s, context)
    };
}

test("Два этапа, памятка, 16 ответов, сохранение один раз", () => {
    const h = harness();
    h.start();
    assert.doesNotMatch(h.query("#app").innerHTML, /Главная причина выбора/);
    for (let i = 0; i < 8; i++) h.answer();
    assert.ok(h.run("session.answers.every(a=>a.reason===null)"));
    assert.match(h.query("#app").innerHTML, /МЕЖДУ ДВУМЯ ЭТАПАМИ/);
    assert.doesNotMatch(h.query("#app").innerHTML, /Пушкин/);
    h.query("#memo-form").onsubmit({
        preventDefault() {}
    });
    assert.match(h.query("#app").innerHTML, /Главная причина выбора/);
    assert.match(h.query("#app").innerHTML, /name="reason" required/);
    for (let i = 8; i < 16; i++) h.answer();
    assert.match(h.query("#app").innerHTML, /ЭКСПЕРИМЕНТ ЗАВЕРШЁН/);
    assert.equal(h.run("records.length"), 1);
    assert.equal(h.run("C.metrics(records[0]).a1"), 100);
    assert.equal(h.run("C.metrics(records[0]).a2"), 100);
    assert.equal(h.run("read(SESSION)"), null);
    h.run("research()");
    assert.equal(h.run("records.length"), 1);
});

test("Имена авторов не показываются в эксперименте и ключе", () => {
    const h = harness();
    const names = /Пушкин|Лермонтов|Тютчев|Блок|Есенин|Бунин|Бальмонт|Фет/iu;
    h.start();
    for (let i = 0; i < 16; i++) {
        if (i === 8) h.query("#memo-form").onsubmit({ preventDefault() {} });
        assert.doesNotMatch(h.query("#app").innerHTML, names);
        h.answer();
    }
    h.run("research()");
    h.query("#key").onclick();
    assert.match(h.query("#key-content").innerHTML, /Человек —/);
    assert.doesNotMatch(h.query("#key-content").innerHTML, names);
    assert.doesNotMatch(h.query("#key-content").innerHTML, /undefined|null/);
});

test("Результаты и прохождения старой версии не перезаписываются", () => {
    const h = harness();
    h.run('localStorage.setItem("authorlab.records.v2", "legacy-records"); localStorage.setItem("authorlab.session.v2", "legacy-session")');
    h.run('localStorage.setItem("authorlab.records.authorlab-2026-v3", "v3-records"); localStorage.setItem("authorlab.session.authorlab-2026-v3", "v3-session")');
    h.start();
    for (let i = 0; i < 16; i++) {
        if (i === 8) h.query("#memo-form").onsubmit({ preventDefault() {} });
        h.answer();
    }
    assert.equal(h.run('localStorage.getItem("authorlab.records.v2")'), "legacy-records");
    assert.equal(h.run('localStorage.getItem("authorlab.session.v2")'), "legacy-session");
    assert.equal(h.run('localStorage.getItem("authorlab.records.authorlab-2026-v3")'), "v3-records");
    assert.equal(h.run('localStorage.getItem("authorlab.session.authorlab-2026-v3")'), "v3-session");
    assert.equal(h.run("records.length"), 1);
    assert.ok(h.run("localStorage.getItem(STORE)"));
});

test("Старые причины этапа 1 остаются совместимыми; новые причины этапа 1 пусты в CSV", () => {
    const h = harness();
    h.start();
    h.answer();
    assert.equal(h.run("session.answers[0].reason"), null);
    assert.equal(h.run("C.validAnswer({id:session.answers[0].id,choice:session.answers[0].choice,confidence:4,reason:'Конкретные детали',recognized:false})"), true);
    assert.equal(h.run("C.validAnswer({id:session.order[8],choice:'human',confidence:4,reason:null,recognized:false})"), false);
});

test("Продолжить позже сохраняет тот же порядок и ответы", () => {
    const h = harness();
    h.start();
    h.answer();
    const order = h.run("JSON.stringify(session.order)");
    const code = h.run("session.code");
    h.query("#pause").onclick();
    assert.match(h.query("#app").innerHTML, /Продолжить сохранённое/);
    h.query("#resume").onclick();
    assert.equal(h.run("session.answers.length"), 1);
    assert.equal(h.run("JSON.stringify(session.order)"), order);
    assert.equal(h.run("session.code"), code);
});

test("Повтор JSON не создаёт дубликат; ошибочный файл не добавляет запись", async () => {
    const h = harness();
    h.start();
    for (let i = 0; i < 8; i++) h.answer();
    h.query("#memo-form").onsubmit({
        preventDefault() {}
    });
    for (let i = 8; i < 16; i++) h.answer();
    const json = h.run("JSON.stringify({format:'authorlab-results',version:D.version,records})");
    h.run("research()");
    await h.query("#import").onchange({
        target: {
            files: [ {
                name: "result.json",
                size: json.length,
                text: async () => json
            } ]
        }
    });
    assert.equal(h.run("records.length"), 1);
    assert.match(h.query("#import-message").textContent, /Дубликатов: 1/);
    await h.query("#import").onchange({
        target: {
            files: [ {
                name: "bad.json",
                size: 3,
                text: async () => "bad"
            } ]
        }
    });
    assert.equal(h.run("records.length"), 1);
    assert.match(h.query("#import-message").textContent, /bad.json/);
});

test("При запрете записи результат остаётся в памяти и в панели", () => {
    const h = harness(true);
    h.start();
    for (let i = 0; i < 8; i++) h.answer();
    h.query("#memo-form").onsubmit({
        preventDefault() {}
    });
    for (let i = 8; i < 16; i++) h.answer();
    assert.match(h.query("#notice").textContent, /не смог сохранить/);
    h.run("home(); research();");
    assert.equal(h.run("records.length"), 1);
});

test("Вкладка детектора строит отчёт модели, не сохраняет введённый стих", async () => {
    const h = harness();
    h.query("#nav-detector").onclick();
    assert.match(h.query("#app").innerHTML, /Детектор/);
    h.query("#detector-text").value = "Экран мерцает на асфальте\nМолчит ночное метро";
    await h.query("#detector-form").onsubmit({
        preventDefault() {}
    });
    assert.match(h.query("#detector-report").innerHTML, /современной городской/);
    assert.match(h.query("#detector-report").innerHTML, /ИИ — 83 %/);
    assert.match(h.query("#detector-report").innerHTML, /Человек — 17 %/);
    assert.equal(h.run("records.length"), 0);
    assert.equal(h.run("session"), null);
    assert.doesNotMatch(h.query("#detector-report").innerHTML, /вероятность ИИ: [0-9]/);
});

test("Совпадение произведения не подменяет оценку модели", async () => {
    const h = harness();
    h.query("#nav-detector").onclick();
    h.query("#detector-text").value = "Я вас любил: любовь ещё, быть может,\nВ душе моей угасла не совсем;\nНо пусть она вас больше не тревожит;";
    await h.query("#detector-form").onsubmit({
        preventDefault() {}
    });
    const html = h.query("#detector-report").innerHTML;
    assert.match(html, /А. С. Пушкин/);
    assert.match(html, /Человек — 17 %/);
    assert.match(html, /Открыть источник/);
});

test("Совпадение без имени и ссылки корректно показывается в детекторе", async () => {
    const h = harness();
    h.query("#nav-detector").onclick();
    h.query("#detector-text").value = h.run('D.poems.find(p => p.id === "H1").text');
    await h.query("#detector-form").onsubmit({ preventDefault() {} });
    const html = h.query("#detector-report").innerHTML;
    assert.match(html, /Найдено совпадение с произведением/);
    assert.match(html, /«Цветок»/);
    assert.doesNotMatch(html, /undefined|null|Открыть источник/);
});

test("Интерфейс детектора использует простые подписи и сообщает о передаче текста", async () => {
    const h = harness();
    h.query("#nav-detector").onclick();
    assert.match(h.query("#app").innerHTML, /текст отправляется на внешний сервер/);
    assert.doesNotMatch(h.query("#app").innerHTML, /модел|классификатор|45 МБ|Загрузка/iu);
    h.query("#detector-text").value = "За окнами вечер и тихий туман\nНа столике ключ и закрытый роман";
    await h.query("#detector-form").onsubmit({
        preventDefault() {}
    });
    const html = h.query("#detector-report").innerHTML;
    assert.match(html, /РЕЗУЛЬТАТ ПРОВЕРКИ/);
    assert.doesNotMatch(html, /модел|классификатор/iu);
});

test("Уход из раздела отменяет запрос и не показывает запоздалый отчёт", async () => {
    const h = harness();
    let signal;
    h.context.AuthorLabAPI.analyze = (text, options) => new Promise((resolve, reject) => {
        signal = options.signal;
        signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), {
            once: true
        });
    });
    h.query("#nav-detector").onclick();
    h.query("#detector-text").value = "Вечер укроет леса и поля\nТихо уснёт под луною земля";
    const pending = h.query("#detector-form").onsubmit({
        preventDefault() {}
    });
    h.query("#nav-home").onclick();
    await pending;
    assert.equal(signal.aborted, true);
    assert.equal(h.query("#detector-report").innerHTML, "");
    assert.doesNotMatch(h.query("#app").innerHTML, /РЕЗУЛЬТАТ ПРОВЕРКИ/);
});
