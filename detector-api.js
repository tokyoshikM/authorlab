const AuthorLabAPI = (() => {
    const endpoint = "https://k1y0mi-ru-ai-text-detector.hf.space/detect?model=v4";
    function cancelled() {
        return new DOMException("Проверка отменена.", "AbortError");
    }
    function pause(milliseconds, signal) {
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                reject(cancelled());
                return;
            }
            const abort = () => {
                clearTimeout(timer);
                reject(cancelled());
            };
            const timer = setTimeout(() => {
                signal.removeEventListener("abort", abort);
                resolve();
            }, milliseconds);
            signal.addEventListener("abort", abort, {
                once: true
            });
        });
    }
    async function analyze(text, options = {}) {
        if (typeof text !== "string" || !text.trim() || text.length > 1e4) throw Error("Введите стихотворение до 10 000 символов.");
        const controller = new AbortController;
        let timedOut = false;
        const abort = () => controller.abort();
        if (options.signal?.aborted) throw cancelled();
        options.signal?.addEventListener("abort", abort, {
            once: true
        });
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, options.timeoutMs || 18e4);
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                options.onStatus?.(attempt ? "Повторное соединение с детектором…" : "Проверяем стихотворение…");
                const response = await fetch(endpoint, {
                    method: "POST",
                    mode: "cors",
                    credentials: "omit",
                    cache: "no-store",
                    referrerPolicy: "no-referrer",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        text: text
                    }),
                    signal: controller.signal
                });
                if ([ 502, 503, 504 ].includes(response.status) && attempt === 0) {
                    const suggested = Number(response.headers.get("Retry-After"));
                    if (Number.isFinite(suggested) && suggested > 15) throw Error("Детектор временно недоступен. Попробуйте проверить стихотворение позже.");
                    options.onStatus?.("Детектор запускается или занят. Подождите, пробуем ещё раз…");
                    await pause(Math.max(5e3, Number.isFinite(suggested) ? suggested * 1e3 : 0), controller.signal);
                    continue;
                }
                if (response.status === 429) throw Error("Слишком много проверок. Подождите немного и повторите попытку.");
                if ([ 502, 503, 504 ].includes(response.status)) throw Error("Детектор временно недоступен. Попробуйте проверить стихотворение позже.");
                if (response.status === 400 || response.status === 422) throw Error("Не удалось обработать этот текст. Проверьте ввод и попробуйте другой фрагмент.");
                if (!response.ok) throw Error("Не удалось выполнить проверку. Повторите попытку позже.");
                let result;
                try {
                    result = await response.json();
                } catch {
                    throw Error("Получен некорректный ответ. Повторите проверку позже.");
                }
                const labels = {
                    "вероятно ИИ": "ai",
                    "вероятно человек": "human"
                };
                if (!result || result.model !== "v4" || typeof result.ai_probability !== "number" || !Number.isFinite(result.ai_probability) || result.ai_probability < 0 || result.ai_probability > 1 || typeof result.threshold !== "number" || !Number.isFinite(result.threshold) || result.threshold < 0 || result.threshold > 1 || !Object.hasOwn(labels, result.verdict)) throw Error("Получен некорректный ответ. Повторите проверку позже.");
                const serverLabel = labels[result.verdict];
                const inconsistent = serverLabel === "human" ? result.ai_probability >= .5 : result.ai_probability < .5;
                return {
                    ai: result.ai_probability,
                    human: 1 - result.ai_probability,
                    label: inconsistent ? "uncertain" : serverLabel,
                    threshold: result.threshold
                };
            }
        } catch (error) {
            if (timedOut) throw Error("Детектор долго не отвечает. Попробуйте проверить стихотворение позже.");
            if (controller.signal.aborted || error.name === "AbortError") throw cancelled();
            if (error instanceof TypeError) throw Error("Не удалось связаться с детектором. Проверьте интернет и повторите попытку.");
            throw error;
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", abort);
        }
    }
    return {
        analyze: analyze
    };
})();

if (typeof module !== "undefined") module.exports = AuthorLabAPI;
