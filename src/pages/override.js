// override.js
// Content script: override /riak/* pages by rewriting the page to the extension editor UI, preserving the URL.
const browser = window.browser ?? chrome;

// Константы по умолчанию
const DEFAULT_OPTIONS = {
  isRiakEnabled: true,
  riakPath: '/riak/'
};

/**
 * Получает настройки из хранилища браузера
 * @returns {Promise<Object>} Объект с настройками
 */
async function getOptions() {
  try {
    const { options = DEFAULT_OPTIONS } = await browser.storage.sync.get('options');
    return options;
  } catch (err) {
    console.error('[Riak Editor] Ошибка при получении настроек:', err);
    return DEFAULT_OPTIONS;
  }
}

/**
 * Проверяет, должна ли страница быть переопределена
 * @param {Object} options Настройки расширения
 * @returns {boolean} Должна ли страница быть переопределена
 */
function shouldOverridePage(options) {
  if (!options.isRiakEnabled) return false;

  const loc = new URL(window.location.href);
  return loc.pathname.startsWith(options.riakPath);
}

/**
 * Проверяет доступность ресурса через HEAD запрос
 * @param {string} url URL для проверки
 * @returns {Promise<boolean>} Доступен ли ресурс
 */
async function isResourceAvailable(url) {
  try {
    const headRes = await fetch(url, { method: 'HEAD' });
    if (!headRes.ok) {
      console.log(
        `[Riak Editor] Пропуск переопределения: ресурс вернул статус ${headRes.status}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.log('[Riak Editor] Ошибка при проверке доступности ресурса:', err);
    return false;
  }
}

/**
 * Получает и инжектирует HTML редактора
 * @param {string} originalHref Исходный URL страницы
 * @returns {Promise<void>}
 */
async function injectEditorContent(originalHref) {
  try {
    const extensionBase = browser.runtime.getURL('/');
    const editorPageUrl = browser.runtime.getURL('/pages/editor/editor.html');
    const response = await fetch(editorPageUrl);
    let html = await response.text();

    const paramsScriptUrl = browser.runtime.getURL('/pages/override-params.js')
      + '?url=' + encodeURIComponent(originalHref);
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<base href="${extensionBase}">\n<script src="${paramsScriptUrl}"></script>`
    );

    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    console.error('[Riak Editor] Не удалось внедрить редактор:', err);
    throw err;
  }
}

/**
 * Инициализация скрипта переопределения
 */
async function init() {
  try {
    const options = await getOptions();

    if (!shouldOverridePage(options)) {
      return;
    }

    const originalHref = window.location.href;

    if (!(await isResourceAvailable(originalHref))) {
      return;
    }

    await injectEditorContent(originalHref);
  } catch (err) {
    console.error('[Riak Editor] Ошибка при переопределении страницы:', err);
  }
}

// Запуск основной функции
init();
