/**
 * Video Stability Assistant – Background Service Worker
 *
 * Coordinates per-tab state, persists settings, and forwards desktop
 * notifications.  Written to run correctly under both Chrome MV3 (service
 * worker) and Firefox MV3 (background scripts array with persistent: false).
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { 
  DEFAULT_SETTINGS, 
  type ExtensionMessage, 
  type TabState, 
  type ExtensionSettings, 
  type VideoMetrics, 
  type StabilityScore, 
  type Advisory, 
  type PredictionResult,
  type MetricsSnapshot
} from '../types';

import {
  shallowMerge,
  sessionGet,
  sessionSet,
  sessionRemove,
  levelToColor,
  levelToLabel
} from '../utils';

import { computeScore } from '../engines/scoring';
import { getAdvisories as evaluateAdvisories } from '../engines/advisory';
import { predictFreeze } from '../engines/prediction';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_STORAGE_KEY = 'vsa_settings';
const TAB_STATE_KEY_PREFIX = 'vsa_tab_';

// ---------------------------------------------------------------------------
// In-Memory History Store
// ---------------------------------------------------------------------------

/**
 * A lightweight per-tab history of the last N bitrate samples.
 * Stored in-memory only; not persisted across service-worker restarts.
 */
const bitrateHistories = new Map<number, number[]>();
const BITRATE_HISTORY_LENGTH = 30;

function pushBitrate(tabId: number, bitrate: number): number[] {
  const history = bitrateHistories.get(tabId) ?? [];
  history.push(bitrate);
  if (history.length > BITRATE_HISTORY_LENGTH) {
    history.shift();
  }
  bitrateHistories.set(tabId, history);
  return history;
}

// ---------------------------------------------------------------------------
// Settings Management
// ---------------------------------------------------------------------------

let cachedSettings: ExtensionSettings | null = null;

async function loadSettings(): Promise<ExtensionSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
    const raw = stored[SETTINGS_STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
    cachedSettings = raw ? shallowMerge(DEFAULT_SETTINGS, raw) : { ...DEFAULT_SETTINGS };
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }

  return cachedSettings;
}

async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const updated = shallowMerge(current, patch);
  cachedSettings = updated;

  await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: updated });
  return updated;
}

async function resetSettings(): Promise<ExtensionSettings> {
  cachedSettings = { ...DEFAULT_SETTINGS };
  await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: cachedSettings });
  return cachedSettings;
}

// ---------------------------------------------------------------------------
// Per-Tab State Management
// ---------------------------------------------------------------------------

async function getTabState(tabId: number): Promise<TabState | null> {
  const state = await sessionGet<TabState>(`${TAB_STATE_KEY_PREFIX}${tabId}`);
  return state ?? null;
}

async function setTabState(tabId: number, state: TabState): Promise<void> {
  await sessionSet(`${TAB_STATE_KEY_PREFIX}${tabId}`, state);
  updateBadge(tabId, state.score ?? null);
}

async function removeTabState(tabId: number): Promise<void> {
  await sessionRemove(`${TAB_STATE_KEY_PREFIX}${tabId}`);
  bitrateHistories.delete(tabId);
  resetBadge(tabId);
}

// ---------------------------------------------------------------------------
// Badge Management
// ---------------------------------------------------------------------------

function updateBadge(tabId: number, score: StabilityScore | null): void {
  if (!score) {
    resetBadge(tabId);
    return;
  }

  const color = levelToColor(score.level);
  const text = score.overall >= 10 ? String(score.overall) : `${score.overall}`;

  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setTitle({
    tabId,
    title: `Video Stability Assistant — ${levelToLabel(score.level)} (${score.overall}/100)`,
  }).catch(() => {});
}

function resetBadge(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  chrome.action.setTitle({ tabId, title: 'Video Stability Assistant' }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Notification Management
// ---------------------------------------------------------------------------

const notifiedCodes = new Map<number, Set<string>>();

function getNewAdvisoryCodes(prev: Advisory[], current: Advisory[]): string[] {
  const prevCodes = new Set(prev.map((a) => a.code));
  return current.filter((a) => !prevCodes.has(a.code)).map((a) => a.code);
}

async function maybeNotify(
  tabId: number,
  advisories: Advisory[],
  previousAdvisories: Advisory[],
  settings: ExtensionSettings,
): Promise<void> {
  if (!settings.enableNotifications) {
    return;
  }

  const newCodes = getNewAdvisoryCodes(previousAdvisories, advisories);
  if (newCodes.length === 0) {
    return;
  }

  const tabNotified = notifiedCodes.get(tabId) ?? new Set();
  const actuallyNew = newCodes.filter((c) => !tabNotified.has(c));
  if (actuallyNew.length === 0) {
    return;
  }

  const thresholdRank: Record<string, number> = {
    excellent: 4,
    good: 3,
    fair: 2,
    poor: 1,
    critical: 0,
  };

  const criticalCodes = actuallyNew.filter((code) => {
    const advisory = advisories.find((a) => a.code === code);
    if (!advisory) {
      return false;
    }
    const severityToPseudoLevel: Record<string, string> = {
      critical: 'critical',
      warning: 'poor',
      info: 'good',
    };
    const pseudoLevel = severityToPseudoLevel[advisory.severity] ?? 'fair';
    return (
      thresholdRank[pseudoLevel] <=
      thresholdRank[settings.notificationThreshold]
    );
  });

  if (criticalCodes.length === 0) {
    return;
  }

  const advisory = advisories.find((a) => a.code === criticalCodes[0]);
  if (!advisory) {
    return;
  }

  const notificationId = `vsa-${tabId}-${Date.now()}`;
  const titlePrefix = chrome.i18n.getMessage('notifTitlePrefix') || 'Video Stability:';

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: `${titlePrefix} ${advisory.title}`,
    message: advisory.description,
    priority: advisory.severity === 'critical' ? 2 : 1,
  });

  criticalCodes.forEach((c) => tabNotified.add(c));
  notifiedCodes.set(tabId, tabNotified);
}

// ---------------------------------------------------------------------------
// Metrics Processing Pipeline
// ---------------------------------------------------------------------------

async function processMetrics(
  tabId: number,
  metrics: VideoMetrics,
): Promise<void> {
  const settings = await loadSettings();
  const bitrateHistory = pushBitrate(tabId, metrics.bitrate);

  // Fetch the previous state for advisory diffing.
  const previous = await getTabState(tabId);
  const previousAdvisories = previous?.advisories ?? [];

  // Scoring pass.
  const score = computeScore(metrics, bitrateHistory, settings.playbackMode);

  // Advisory pass.
  const advisories = evaluateAdvisories(
    metrics,
    score,
    settings.playbackMode,
    settings.language,
    settings.advisoryMode,
    metrics.timestamp,
  );

  // Prediction pass (gated by settings).
  let prediction: PredictionResult | null = null;
  if (settings.enablePrediction) {
    const historySnapshot: MetricsSnapshot[] = previous?.metrics
      ? [
          {
            timestamp: previous.metrics.timestamp,
            bufferAhead: previous.metrics.bufferAhead,
            droppedFrames: previous.metrics.droppedFrames,
            totalFrames: previous.metrics.totalFrames,
            bitrate: previous.metrics.bitrate,
            stallCount: previous.metrics.stallCount,
            decodeTime: previous.metrics.decodeTime,
          },
        ]
      : [];

    prediction = predictFreeze(metrics, historySnapshot);
  }

  const state: TabState = {
    tabId,
    url: metrics.url,
    metrics,
    score,
    advisories,
    prediction,
    lastUpdated: Date.now(),
  };

  await setTabState(tabId, state);
  await maybeNotify(tabId, advisories, previousAdvisories, settings);
}

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
      case 'METRICS_UPDATE': {
        if (!tabId) {
          return false;
        }
        void processMetrics(tabId, message.payload as VideoMetrics).catch(console.error);
        sendResponse({ ok: true });
        return false;
      }

      case 'GET_TAB_STATE': {
        const queryTabId = tabId ?? null;
        if (!queryTabId) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { void (async () => {
            const activeTabId = tabs[0]?.id;
            if (!activeTabId) {
              sendResponse({ type: 'TAB_STATE_RESPONSE', payload: null });
              return;
            }
            const state = await getTabState(activeTabId);
            sendResponse({ type: 'TAB_STATE_RESPONSE', payload: state });
          })(); });
          return true;
        }

        void getTabState(queryTabId).then((state) =>
          sendResponse({ type: 'TAB_STATE_RESPONSE', payload: state }),
        );
        return true;
      }

      case 'GET_SETTINGS': {
        void loadSettings().then((settings) =>
          sendResponse({ type: 'SETTINGS_RESPONSE', payload: settings }),
        );
        return true;
      }

      case 'UPDATE_SETTINGS': {
        void saveSettings(message.payload as Partial<ExtensionSettings>).then((settings) =>
          sendResponse({ type: 'SETTINGS_UPDATED', payload: settings }),
        );
        return true;
      }

      case 'RESET_SETTINGS': {
        void resetSettings().then((settings) =>
          sendResponse({ type: 'SETTINGS_UPDATED', payload: settings }),
        );
        return true;
      }

      case 'PING': {
        sendResponse({ type: 'PONG' });
        return false;
      }

      default:
        return false;
    }
  },
);

// ---------------------------------------------------------------------------
// Lifecycle Listeners
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabState(tabId).catch(console.error);
  notifiedCodes.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void loadSettings().catch(console.error);
});
