const browser = window.browser ?? chrome;

document.addEventListener('DOMContentLoaded', async () => {
    const enabledCheckbox = document.getElementById('enabled');
    const riakPathInput = document.getElementById('riak_path');
    const status = document.getElementById('status');

    const { options: savedOptions = { isRiakEnabled: true, riakPath: '/riak/' } } =
        await browser.storage.sync.get('options');
    const { isRiakEnabled, riakPath } = savedOptions;
    enabledCheckbox.checked = isRiakEnabled;
    riakPathInput.value = riakPath;

    document.getElementById('saveBtn').addEventListener('click', async () => {
        const options = {
            isRiakEnabled: enabledCheckbox.checked,
            riakPath: riakPathInput.value,
        };
        await browser.storage.sync.set({ options });
        status.textContent = 'Options saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    });
});