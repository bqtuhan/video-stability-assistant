/**
 * Video Stability Assistant – Content Script Entry Point v2.0
 * @license Apache-2.0
 */
import { VideoObserver } from './observer';
import { hostnameFromUrl } from '../utils';
import { DEFAULT_SETTINGS, type ExtensionMessage, type ExtensionSettings } from '../types';

let observer: VideoObserver | null = null;
let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let initialized = false;
let hudElement: HTMLElement | null = null;

async function initialise(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage);
    if (response && (response as any).type === 'SETTINGS_RESPONSE') {
      currentSettings = (response as any).payload;
    }
  } catch { /* ignore */ }

  if (!isSiteEnabled(currentSettings)) return;

  attachObserver();
  if (currentSettings.enableHud) attachHud();
  
  listenForSettingsChanges();
  listenForVisibilityChanges();
}

function attachObserver(): void {
  if (observer) return;
  observer = new VideoObserver({
    samplingIntervalMs: currentSettings.samplingIntervalMs,
    onMetrics: (m) => updateHud(m)
  });
  observer.attach();
}

function attachHud(): void {
  if (hudElement || !currentSettings.enableHud) return;

  fetch(chrome.runtime.getURL('hud.html'))
    .then(r => r.text())
    .then(html => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      hudElement = wrapper.firstElementChild as HTMLElement;
      document.body.appendChild(hudElement);

      const closeBtn = hudElement.querySelector('#vsa-hud-close');
      closeBtn?.addEventListener('click', () => {
        hudElement?.classList.add('vsa-hud-hidden');
      });
    });
}

function updateHud(metrics: any): void {
  if (!hudElement || hudElement.classList.contains('vsa-hud-hidden')) return;

  // This would ideally receive the full TabState from background, 
  // but for now we'll update basic metrics.
  const bufferEl = hudElement.querySelector('#vsa-hud-buffer');
  if (bufferEl) bufferEl.textContent = `${metrics.bufferAhead.toFixed(1)}s`;

  const bitrateEl = hudElement.querySelector('#vsa-hud-bitrate');
  if (bitrateEl) bitrateEl.textContent = metrics.bitrate >= 1000 
    ? `${(metrics.bitrate / 1000).toFixed(1)} Mbps` 
    : `${Math.round(metrics.bitrate)} kbps`;

  const resEl = hudElement.querySelector('#vsa-hud-resolution');
  if (resEl) resEl.textContent = metrics.resolution || '--';
}

function listenForSettingsChanges(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'SETTINGS_UPDATED') {
      currentSettings = message.payload as ExtensionSettings;
      if (currentSettings.enableHud) attachHud();
      else hudElement?.remove();
    }
  });
}

function listenForVisibilityChanges(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') observer?.detach();
    else observer?.attach();
  });
}

function isSiteEnabled(settings: ExtensionSettings): boolean {
  if (settings.enabledSites.length === 0) return true;
  const hostname = hostnameFromUrl(window.location.href);
  return settings.enabledSites.some(s => hostname === s || hostname.endsWith(`.${s}`));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialise());
} else {
  void initialise();
}
