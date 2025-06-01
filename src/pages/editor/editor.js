const browser = window.browser ?? chrome;
const Mustache = window.Mustache ?? window.mustache ?? mustache;

document.addEventListener("DOMContentLoaded", init);

/**
 * Инициализирует редактор при загрузке страницы.
 * Получает URL из параметров и загружает соответствующий контент.
 * @async
 * @returns {Promise<void>}
 */
async function init() {
    let url;
    const params = new URLSearchParams(window.location.search);
    if (window.RIAK_EDITOR_PARAMS && window.RIAK_EDITOR_PARAMS.url) {
        url = window.RIAK_EDITOR_PARAMS.url;
    } else {
        url = params.get("url");
    }
    if (!url) {
        showMessage("No URL specified", true);
        return;
    }
    await loadAndRender(url);
}

/**
 * Загружает данные по указанному URL и отображает их на странице.
 * @async
 * @param {string} url - URL для загрузки данных
 * @returns {Promise<void>}
 */
async function loadAndRender(url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const origin = new URL(url).origin;
        await renderPage({
            text,
            headers: res.headers,
            status: res.status,
            statusText: res.statusText,
            url,
            origin,
        });
    } catch (err) {
        showMessage(`Fetch error: ${err}`, true);
    }
}

/**
 * Рендерит страницу редактора с полученным JSON-объектом и метаданными.
 * @async
 * @param {Object} resp - Объект ответа
 * @param {string} resp.text - Текст ответа
 * @param {Headers} resp.headers - HTTP-заголовки ответа
 * @param {number} resp.status - HTTP-статус ответа
 * @param {string} resp.statusText - Текстовое описание HTTP-статуса
 * @param {string} resp.url - URL, с которого был получен ответ
 * @param {string} resp.origin - Источник URL
 * @returns {Promise<void>}
 */
async function renderPage(resp) {
    let data = null;
    try {
        data = JSON.parse(resp.text);
    } catch (e) {
        showMessage("Response is not valid JSON", true);
        return;
    }

    const metaEl = document.getElementById("meta");
    const editorEl = document.getElementById("editor");
    const template = document.getElementById("template-meta").innerHTML;
    const { fields, links } = parseMetadata(resp.headers);
    metaEl.innerHTML = Mustache.render(template, { fields, links, origin: resp.origin });

    const editor = new JSONEditor(
        editorEl,
        { mode: "code", indentation: 2 },
        data,
    );
    const saveBtn = metaEl.querySelector("#saveBtn");
    const deleteBtn = metaEl.querySelector("#deleteBtn");
    saveBtn.addEventListener("click", () => handleSave(editor, resp));
    deleteBtn.addEventListener("click", () => handleDelete(resp.url));
}

/**
 * Извлекает метаданные из HTTP-заголовков.
 * @param {Headers} headers - HTTP-заголовки ответа
 * @returns {Object} Объект с полями и ссылками
 * @returns {Array<{name: string, value: string}>} fields - Массив полей метаданных
 * @returns {Array<Object>} links - Массив связанных объектов
 */
const parseMetadata = headers => {
    const fields = [];
    const links = [];
    const etag = headers.get("Etag") ?? headers.get("ETag");
    if (etag) fields.push({ name: "ETag", value: etag });

    const vclock = headers.get("X-Riak-Vclock");
    if (vclock) fields.push({ name: "Vclock", value: vclock });

    const length = headers.get("Content-Length");
    if (length) fields.push({ name: "Length", value: length });

    const lastModified = headers.get("Last-Modified");
    if (lastModified) fields.push({ name: "Last-Modified", value: lastModified });

    const linkHeader = headers.get("Link");
    if (linkHeader) links.push(...parseLinkHeader(linkHeader));
    return { fields, links };
};

/**
 * Разбирает заголовок Link в структурированные данные.
 * @param {string} headerValue - Значение заголовка Link
 * @returns {Array<Object>} Массив объектов с данными о связях
 * @returns {Array<{url: string, bucket?: string, id?: string, meta: string}>} Данные о связях
 */
const parseLinkHeader = headerValue =>
    headerValue
        .split(",")
        .map(linkEntry => {
            const [urlPart, metaPart] = linkEntry.split(";").map(s => s.trim())
            const url = urlPart.match(/^<(.*)>$/)[1];

            // Skip "up" links
            if (metaPart === 'rel="up"') return undefined;

            // Parse meta as key-value
            let [key, value] = metaPart.split('=').map(s => s.trim());
            value = value.match(/^"(.*)"$/)[1];
            const meta = key === 'riaktag' ? value : metaPart;

            // Extract uuid4 from url
            const bucketMatch = url.match(/\/?riak\/(.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
            if (bucketMatch !== null) {
                return { url, bucket: bucketMatch[1], id: bucketMatch[2], meta };
            }

            // Fallback: unknown pattern
            return { url, meta };
        })
        .filter(Boolean);

/**
 * Обрабатывает сохранение отредактированного JSON-объекта.
 * @async
 * @param {JSONEditor} editor - Экземпляр редактора JSON
 * @param {Object} resp - Объект с данными исходного ответа
 * @returns {Promise<void>}
 */
const handleSave = async (editor, resp) => {
    const updated = editor.get();
    let body;
    try {
        body = JSON.stringify(updated);
    } catch (err) {
        showMessage(`Error serializing JSON: ${err}`, true);
        return;
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    const vclockHdr = resp.headers.get("X-Riak-Vclock");
    if (vclockHdr) headers.set("X-Riak-Vclock", vclockHdr);
    const linkHdr = resp.headers.get("Link");
    if (linkHdr) headers.set("Link", linkHdr);

    try {
        const res = await fetch(resp.url, { method: "PUT", headers, body });
        if (res.ok) {
            showMessage("Saved successfully");
        } else {
            showMessage(`Save failed: ${res.status} ${res.statusText}`, true);
        }
    } catch (err) {
        showMessage(`Save error: ${err}`, true);
    }
};

/**
 * Обрабатывает удаление объекта.
 * @async
 * @param {string} url - URL объекта для удаления
 * @returns {Promise<void>}
 */
const handleDelete = async url => {
    if (!confirm("Are you sure you want to delete this object?")) return;
    try {
        const res = await fetch(url, { method: "DELETE" });
        if (res.ok) {
            showMessage("Deleted successfully");
        } else {
            showMessage(`Delete failed: ${res.status} ${res.statusText}`, true);
        }
    } catch (err) {
        showMessage(`Delete error: ${err}`, true);
    }
};

let messageTimer;

/**
 * Скрывает сообщение в интерфейсе.
 */
const hideMessage = () => {
    const el = document.getElementById("messages");
    el.style.display = "none";
};

/**
 * Отображает сообщение пользователю.
 * @param {string} msg - Текст сообщения
 * @param {boolean} [isError=false] - Флаг ошибки, если true - сообщение будет красным
 */
const showMessage = (msg, isError = false) => {
    const el = document.getElementById("messages");
    el.innerHTML = `<span class="msg-text">${msg}</span>` +
                 `<button class="msg-close" type="button">&times;</button>`;
    el.style.display = "flex";
    el.style.color = isError ? "red" : "";
    const btn = el.querySelector(".msg-close");
    btn.addEventListener("click", hideMessage);
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(hideMessage, 5000);
};
