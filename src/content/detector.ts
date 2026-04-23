/**
 * Video Stability Assistant – Content Script Entry Point v2.0
 * @license Apache-2.0
 */
import { VideoObserver } from './observer';
import { hostnameFromUrl } from '../utils';
import {
  DEFAULT_SETTINGS,
  type ExtensionMessage,
  type ExtensionSettings,
  type VideoMetrics,
} from '../types';

let observer: VideoObserver | null = null;
let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let initialized = false;
let hudElement: HTMLElement | null = null;

async function initialise(): Promise<void> {
  if (initialized) { return; }
  initialized = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage);
    const typed = response as ExtensionMessage<ExtensionSettings> | undefined;
    if (typed?.type === 'SETTINGS_RESPONSE' && typed.payload) {
      currentSettings = typed.payload;
    }
  } catch { /* ignore – background may not be ready */ }

  if (!isSiteEnabled(currentSettings)) { return; }

  attachObserver();
  if (currentSettings.enableHud) { void attachHud(); }

  listenForSettingsChanges();
  listenForVisibilityChanges();
}

function attachObserver(): void {
  if (observer) { return; }
  observer = new VideoObserver({
    samplingIntervalMs: currentSettings.samplingIntervalMs,
    onMetrics: (m) => { updateHud(m); },
  });
  observer.attach();
}

async function attachHud(): Promise<void> {
  if (hudElement !== null || !currentSettings.enableHud) { return; }
  try {
    const url = chrome.runtime.getURL('hud.html');
    const response = await fetch(url);
    const html = await response.text();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    hudElement = wrapper.firstElementChild as HTMLElement;
    document.body.appendChild(hudElement);
    const closeBtn = hudElement.querySelector('#vsa-hud-close');
    closeBtn?.addEventListener('click', () => {
      hudElement?.classList.add('vsa-hud-hidden');
    });
  } catch { /* HUD unavailable – non-fatal */ }
}

function updateHud(metrics: VideoMetrics): void {
  if (!hudElement || hudElement.classList.contains('vsa-hud-hidden')) { return; }

  const bufferEl = hudElement.querySelector('#vsa-hud-buffer');
  if (bufferEl) { bufferEl.textContent = `${metrics.bufferAhead.toFixed(1)}s`; }

  const bitrateEl = hudElement.querySelector('#vsa-hud-bitrate');
  if (bitrateEl) {
    bitrateEl.textContent = metrics.bitrate >= 1000
      ? `${(metrics.bitrate / 1000).toFixed(1)} Mbps`
      : `${Math.round(metrics.bitrate)} kbps`;
  }

  const resEl = hudElement.querySelector('#vsa-hud-resolution');
  if (resEl) { resEl.textContent = metrics.resolution ?? '--'; }
}

function listenForSettingsChanges(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'SETTINGS_UPDATED') {
      currentSettings = message.payload as ExtensionSettings;
      if (currentSettings.enableHud) {
        void attachHud();
      } else {
        hudElement?.remove();
        hudElement = null;
      }
    }
  });
}

function listenForVisibilityChanges(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      observer?.detach();
    } else {
      observer?.attach();
    }
  });
}

function isSiteEnabled(settings: ExtensionSettings): boolean {
  if (settings.enabledSites.length === 0) { return true; }
  const hostname = hostnameFromUrl(window.location.href);
  return settings.enabledSites.some(s => hostname === s || hostname.endsWith(`.${s}`));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void initialise(); });
} else {
  void initialise();
}
