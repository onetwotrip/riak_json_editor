const browser = window.browser ?? chrome;

/** Константы по умолчанию */
const DEFAULT_OPTIONS = {
    isRiakEnabled: true,
    riakPath: '/riak/'
};

/**
 * Загрузка опций из хранилища
 * @returns {Promise<Object>} Объект с опциями расширения
 */
async function loadOptions() {
    try {
        const { options = DEFAULT_OPTIONS } = await browser.storage.sync.get('options');
        return options;
    } catch (error) {
        console.error('Error loading options:', error);
        return DEFAULT_OPTIONS;
    }
}

/**
 * Обновление пользовательского интерфейса
 * @param {Object} options - Объект с опциями расширения
 */
function updateUI(options) {
    const enabledCheckbox = document.getElementById('enabled');
    const riakPathInput = document.getElementById('riak_path');

    enabledCheckbox.checked = options.isRiakEnabled;
    riakPathInput.value = options.riakPath;
}

/**
 * Валидация введенных опций
 * @param {Object} options - Объект с опциями для нормализации
 * @returns {Object} Нормализованный объект опций
 */
function normalizeOptions(options) {
    // Проверяем, что путь начинается и заканчивается на "/"
    if (!options.riakPath.startsWith('/')) {
        options.riakPath = '/' + options.riakPath;
    }
    if (!options.riakPath.endsWith('/')) {
        options.riakPath = options.riakPath + '/';
    }
    return options;
}

/**
 * Сохранение опций
 * @returns {Promise<boolean>} Результат операции сохранения
 */
async function saveOptions() {
    try {
        const enabledCheckbox = document.getElementById('enabled');
        const riakPathInput = document.getElementById('riak_path');

        let options = {
            isRiakEnabled: enabledCheckbox.checked,
            riakPath: riakPathInput.value.trim(),
        };

        options = normalizeOptions(options);
        await browser.storage.sync.set({ options });
        showStatus('Options saved.');
        return true;
    } catch (error) {
        console.error('Error saving options:', error);
        showStatus('Error saving options!', true);
        return false;
    }
}

/**
 * Отображение статуса операции
 * @param {string} message - Сообщение для отображения
 * @param {boolean} [isError=false] - Флаг ошибки
 */
function showStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = isError ? 'error' : 'success';

    if (!isError) {
        setTimeout(() => {
            status.textContent = '';
            status.className = '';
        }, 2000);
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    const options = await loadOptions();
    updateUI(options);

    document.getElementById('saveBtn').addEventListener('click', saveOptions);
});
