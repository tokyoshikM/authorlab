const test = require("node:test"), assert = require("node:assert/strict");

const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");

function harness(fetch, fastRetry = false) {
    const context = vm.createContext({
        fetch: fetch,
        AbortController: AbortController,
        DOMException: DOMException,
        TypeError: TypeError,
        Error: Error,
        clearTimeout: clearTimeout,
        setTimeout: (fn, ms) => setTimeout(fn, fastRetry && ms === 5e3 ? 0 : ms)
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../detector-api.js"), "utf8"), context);
    return vm.runInContext("AuthorLabAPI", context);
}

function response(overrides = {}, status = 200) {
    return new Response(JSON.stringify({
        model: "v4",
        ai_probability: .304,
        verdict: "вероятно человек",
        threshold: .834,
        ...overrides
    }), {
        status: status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

test("API отправляет только текст на выбранный сервер и читает ответ", async () => {
    const calls = [], status = [];
    const api = harness(async (url, options) => {
        calls.push({
            url: url,
            options: options
        });
        return response();
    });
    const score = await api.analyze("Первая строка\nВторая строка", {
        onStatus: value => status.push(value)
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://k1y0mi-ru-ai-text-detector.hf.space/detect?model=v4");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        text: "Первая строка\nВторая строка"
    });
    assert.equal(calls[0].options.credentials, "omit");
    assert.equal(score.ai, .304);
    assert.equal(score.label, "human");
    assert.equal(score.threshold, .834);
    assert.equal(status[0], "Проверяем стихотворение…");
});

test("Спорный вердикт у границы округления показывается как неоднозначный", async () => {
    const api = harness(async () => response({
        ai_probability: .834,
        threshold: .834,
        verdict: "вероятно человек"
    }));
    assert.equal((await api.analyze("Строка\nВторая строка")).label, "uncertain");
});

test("Повтор при запуске сервера ограничен одной попыткой", async () => {
    let count = 0;
    const api = harness(async () => {
        count++;
        return count === 1 ? new Response("", {
            status: 503
        }) : response();
    }, true);
    await api.analyze("Первая строка\nВторая строка");
    assert.equal(count, 2);
    let failed = 0;
    const unavailable = harness(async () => {
        failed++;
        return new Response("", {
            status: 503
        });
    }, true);
    await assert.rejects(unavailable.analyze("Строка\nСтрока"), /временно недоступен/);
    assert.equal(failed, 2);
});

test("Лимит запросов и ошибка сети не дают выдуманный результат", async () => {
    for (const [fetch, message] of [ [ async () => new Response("", {
        status: 429
    }), /много проверок/ ], [ async () => {
        throw new TypeError("network");
    }, /связаться/ ] ]) {
        await assert.rejects(harness(fetch).analyze("Первая строка\nВторая строка"), message);
    }
});

test("Поврежденный ответ и другая версия не принимаются", async () => {
    for (const fetch of [ async () => new Response("<html>error</html>"), async () => response({
        ai_probability: -1
    }), async () => response({
        model: "v1"
    }), async () => response({
        threshold: 2
    }), async () => response({
        verdict: "<script>"
    }) ]) {
        await assert.rejects(harness(fetch).analyze("Строка\nДругая строка"), /некорректный ответ/);
    }
});

test("Отмена и тайм-аут прерывают запрос", async () => {
    const fetch = (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true
    }));
    const api = harness(fetch), controller = new AbortController;
    const pending = api.analyze("Строка\nДругая строка", {
        signal: controller.signal
    });
    controller.abort();
    await assert.rejects(pending, error => error.name === "AbortError");
    await assert.rejects(api.analyze("Строка\nДругая строка", {
        timeoutMs: 5
    }), /долго не отвечает/);
});
