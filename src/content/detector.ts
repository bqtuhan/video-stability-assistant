/**
 * Video Stability Assistant – Content Script Entry Point (detector.ts)
 *
 * This module is injected by the browser into every matching page.
 * It bootstraps the VideoObserver, reads the user's settings from the
 * service worker, and manages the observer lifecycle in response to
 * page-visibility changes and single-page-application navigations.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { VideoObserver } from './observer';
import { hostnameFromUrl, debounce } from '../utils';
import { 
  DEFAULT_SETTINGS, 
  type ExtensionMessage, 
  type ExtensionSettings 
} from '../types';

// ---------------------------------------------------------------------------
// Module-Level State
// ---------------------------------------------------------------------------

let observer: VideoObserver | null = null;
let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let initialized = false;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Bootstraps the extension on the current page.
 * Fetches settings from the background, checks site allowlist,
 * and attaches the VideoObserver if the page is permitted.
 */
async function initialise(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SETTINGS',
    } as ExtensionMessage);

    if (response && (response as { type: string }).type === 'SETTINGS_RESPONSE') {
      currentSettings = (response as { type: string; payload: ExtensionSettings }).payload;
    }
  } catch {
    // Service worker may be starting up; proceed with defaults.
  }

  if (!isSiteEnabled(currentSettings)) {
    return; // Site not in the allowlist; do not inject observer.
  }

  attachObserver();
  listenForSettingsChanges();
  listenForVisibilityChanges();
  listenForNavigationChanges();
}

// ---------------------------------------------------------------------------
// Observer Management
// ---------------------------------------------------------------------------

function attachObserver(): void {
  if (observer !== null) {
    return;
  }

  observer = new VideoObserver({
    samplingIntervalMs: currentSettings.samplingIntervalMs,
    messageThrottleMs: Math.max(currentSettings.samplingIntervalMs - 100, 300),
    onStall: (duration, timestamp) => {
      if (currentSettings.enableNotifications) {
        chrome.runtime.sendMessage({
          type: 'STALL_DETECTED',
          payload: { duration, timestamp },
        } as ExtensionMessage).catch(() => {});
      }
    },
  });

  observer.attach();
}

function detachObserver(): void {
  observer?.detach();
  observer = null;
  initialized = false;
}

function restartObserver(): void {
  detachObserver();
  initialized = false;
  void initialise();
}

// ---------------------------------------------------------------------------
// Settings Listener
// ---------------------------------------------------------------------------

function listenForSettingsChanges(): void {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'SETTINGS_UPDATED') {
        const newSettings = message.payload as ExtensionSettings;
        const intervalChanged =
          newSettings.samplingIntervalMs !== currentSettings.samplingIntervalMs;
        const siteAllowlistChanged =
          JSON.stringify(newSettings.enabledSites) !==
          JSON.stringify(currentSettings.enabledSites);

        currentSettings = newSettings;

        if (intervalChanged || siteAllowlistChanged) {
          restartObserver();
        }

        sendResponse({ ok: true });
        return true;
      }

      if (message.type === 'PING') {
        sendResponse({ type: 'PONG' });
        return true;
      }

      return false;
    },
  );
}

// ---------------------------------------------------------------------------
// Page-Visibility Changes
// ---------------------------------------------------------------------------

function listenForVisibilityChanges(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Suspend sampling while the tab is in the background to conserve resources.
      observer?.detach();
    } else {
      // Resume when the tab becomes active again.
      attachObserver();
    }
  });
}

// ---------------------------------------------------------------------------
// SPA Navigation Detection
// ---------------------------------------------------------------------------

/**
 * Detects single-page-application navigations by observing changes to
 * `window.location.href` via a debounced interval check.
 *
 * This approach is used instead of patching `history.pushState` to avoid
 * conflicts with frameworks that wrap the History API.
 */
function listenForNavigationChanges(): void {
  let lastHref = window.location.href;

  const checkNavigation = debounce(() => {
    const currentHref = window.location.href;
    if (currentHref !== lastHref) {
      lastHref = currentHref;
      restartObserver();
    }
  }, 300);

  // Poll via MutationObserver on the title element (changes on SPA nav).
  const titleObserver = new MutationObserver(
    checkNavigation,
  );

  const titleEl = document.querySelector('title');
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true });
  }

  // Also observe the document body's immediate children for SPA root changes.
  const bodyObserver = new MutationObserver(
    checkNavigation,
  );

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true });
  }
}

// ---------------------------------------------------------------------------
// Site Allowlist Check
// ---------------------------------------------------------------------------

function isSiteEnabled(settings: ExtensionSettings): boolean {
  if (settings.enabledSites.length === 0) {
    return true; // All sites enabled.
  }
  const hostname = hostnameFromUrl(window.location.href);
  return settings.enabledSites.some(
    (site) => hostname === site || hostname.endsWith(`.${site}`),
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Delay initialisation until the DOM is ready to ensure `document.body`
// is available for the SPA navigation observer.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialise());
} else {
  void initialise();
}
