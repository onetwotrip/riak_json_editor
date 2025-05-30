document.addEventListener('DOMContentLoaded', function() {
  const enabledCheckbox = document.getElementById('enabled');
  const riakPathInput = document.getElementById('riak_path');
  const status = document.getElementById('status');

  chrome.storage.sync.get(['options'], function(result) {
    const options = result.options || { isRiakEnabled: true, riakPath: '/riak/' };
    enabledCheckbox.checked = !!options.isRiakEnabled;
    riakPathInput.value = options.riakPath;
  });

  document.getElementById('saveBtn').addEventListener('click', function() {
    const options = {
      isRiakEnabled: enabledCheckbox.checked,
      riakPath: riakPathInput.value
    };
    chrome.storage.sync.set({ options: options }, function() {
      status.textContent = 'Options saved.';
      setTimeout(function() { status.textContent = ''; }, 2000);
    });
  });
});