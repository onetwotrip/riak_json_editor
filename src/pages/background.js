// Background service worker for the extension.

const browserObj = typeof browser === "undefined" ? chrome : browser;

// Constants
const DEFAULT_ENABLED_STATE = true;
const ICON_PATHS = {
  enabled: {
    16: '/icons/icon16.png',
    19: '/icons/icon19.png',     // Для старых версий Chrome
    24: '/icons/icon24.png',     // Для тулбара с высоким DPI
    32: '/icons/icon32.png',     // Для экранов с высоким разрешением
    48: '/icons/icon48.png',
    64: '/icons/icon64.png',     // Для средне-больших значков
    128: '/icons/icon128.png',
    256: '/icons/icon256.png'    // Для максимального качества и магазина расширений
  },
  disabled: {
    16: '/icons/icon16-disabled.png',
    19: '/icons/icon19-disabled.png',
    24: '/icons/icon24-disabled.png',
    32: '/icons/icon32-disabled.png',
    48: '/icons/icon48-disabled.png',
    64: '/icons/icon64-disabled.png',
    128: '/icons/icon128-disabled.png',
    256: '/icons/icon256-disabled.png'
  }
};

/**
 * Updates the extension icon based on the enabled state
 * @param {boolean} isEnabled - Whether Riak is enabled
 */
async function updateIcon(isEnabled) {
  await browserObj.action.setIcon({
    path: isEnabled ? ICON_PATHS.enabled : ICON_PATHS.disabled
  });
}

/**
 * Initializes the extension by setting the icon based on the enabled state
  */
async function initialize() {
  const { isRiakEnabled } = await browserObj.storage.sync.get({ isRiakEnabled: DEFAULT_ENABLED_STATE });
  await updateIcon(isRiakEnabled);
}

// Toggle plugin on/off when the toolbar icon is clicked
browserObj.action.onClicked.addListener(async (tab) => {
  const { isRiakEnabled } = await browserObj.storage.sync.get({ isRiakEnabled: DEFAULT_ENABLED_STATE });
  const newEnabled = !isRiakEnabled;

  await browserObj.storage.sync.set({ isRiakEnabled: newEnabled });
  await updateIcon(newEnabled);

  if (tab && tab.id) {
    try {
      await browserObj.tabs.reload(tab.id);
    } catch (e) {
      console.error('[Riak Editor] Failed to reload tab', e);
    }
  }
});

// Run initialization
initialize();
