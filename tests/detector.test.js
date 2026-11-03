const test = require("node:test"), assert = require("node:assert/strict");

const Detector = require("../detector.js");

const Data = require("../data.js");

test("Литературный разбор считает слоги и словоформы", () => {
    const result = Detector.analyze("Мама мыла раму\nРаму мыла мама");
    assert.deepEqual(result.syllables, [ 6, 6 ]);
    assert.equal(result.words, 6);
    assert.equal(result.unique, 3);
    assert.equal(result.ttr, .5);
    assert.equal(result.mattr, null);
    assert.equal(result.stress.name, null);
});

test("Разметка ударений учитывается", () => {
    const result = Detector.analyze("В саду́ звени́т весе́нний ве́тер,\nНа берегу́ молчи́т вода́.");
    assert.equal(result.stress.marked, 7);
    assert.equal(result.stress.coverage, 1);
});

test("Эпоха остаётся словарным наблюдением", () => {
    assert.match(Detector.analyze("Экран мерцает на асфальте\nМолчит ночное метро").era.label, /современной/);
    assert.match(Detector.analyze("Свет гаснет в окне\nИ дождь уже идёт").era.label, /не определяется/);
});

test("Литературные наблюдения не рассчитывают проценты авторства", () => {
    for (const text of [ Data.poems[0].text, Data.poems.at(-1).text, "Мечта наполнится светом опять\nМечта наполнится светом всегда" ]) {
        const result = Detector.analyze(text);
        for (const key of [ "aiPercent", "humanPercent", "rawScore", "verdict" ]) assert.equal(Object.hasOwn(result, key), false);
        assert.ok(result.indicators.every(item => !Object.hasOwn(item, "weight")));
    }
});

test("Известный источник и цитата различаются", () => {
    const text = "Мороз и солнце, день чудесный!\nЕще ты дремлешь, друг прелестный —\nПора, красавица, проснись!";
    assert.equal(Detector.analyze(text).knownSource.author, "А. С. Пушкин");
    const mixed = Detector.analyze(text + "\nНовая строка о далеком городе");
    assert.equal(mixed.knownSource, null);
    assert.equal(mixed.quotedSource.author, "А. С. Пушкин");
});

test("Невалидный ввод отклоняется до вызова модели", () => {
    for (const text of [ "", "Одна строка", "!!!\n???", "english words only\nin both lines", Array(81).fill("строка").join("\n"), "а".repeat(10001) + "\nб" ]) assert.throws(() => Detector.analyze(text));
});
