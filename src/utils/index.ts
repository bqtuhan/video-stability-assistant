/**
 * Video Stability Assistant – Shared Utilities
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type { StabilityLevel } from '../types';

// ---------------------------------------------------------------------------
// Numeric Helpers
// ---------------------------------------------------------------------------

/**
 * Clamps `value` to the inclusive range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between `a` and `b` by factor `t` ∈ [0, 1].
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalises `value` from the range [inMin, inMax] to [outMin, outMax].
 * Returns `outMin` when the input range is degenerate (inMin === inMax).
 */
export function normalise(
  value: number,
  inMin: number,
  inMax: number,
  outMin = 0,
  outMax = 100,
): number {
  if (inMax === inMin) {
    return outMin;
  }
  const ratio = (value - inMin) / (inMax - inMin);
  return clamp(outMin + ratio * (outMax - outMin), outMin, outMax);
}

/**
 * Returns the arithmetic mean of an array of numbers.
 * Returns 0 for an empty array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Returns the population variance of an array of numbers.
 * Returns 0 for arrays with fewer than two elements.
 */
export function variance(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  return mean(values.map((v) => (v - avg) ** 2));
}

/**
 * Returns the population standard deviation of an array of numbers.
 */
export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Rounds `value` to `decimals` decimal places.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Rate Limiting / Throttling
// ---------------------------------------------------------------------------

/**
 * Returns a throttled version of `fn` that executes at most once every
 * `intervalMs` milliseconds.  Unlike debounce, the first call is immediate
 * and subsequent calls within the window are silently dropped.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  intervalMs: number,
): T {
  let lastCall = 0;
  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

/**
 * Returns a debounced version of `fn` that waits `delayMs` milliseconds
 * after the last invocation before executing.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }) as T;
}

// ---------------------------------------------------------------------------
// Stability Score Helpers
// ---------------------------------------------------------------------------

/** Score thresholds (inclusive lower bound) for each stability level. */
const LEVEL_THRESHOLDS: [number, StabilityLevel][] = [
  [85, 'excellent'],
  [65, 'good'],
  [45, 'fair'],
  [25, 'poor'],
  [0, 'critical'],
];

/**
 * Derives the qualitative {@link StabilityLevel} from a numeric score
 * in [0, 100].
 */
export function scoreToLevel(score: number): StabilityLevel {
  for (const [threshold, level] of LEVEL_THRESHOLDS) {
    if (score >= threshold) {
      return level;
    }
  }
  return 'critical';
}

/**
 * Maps a {@link StabilityLevel} to a CSS hex colour for consistent UI
 * theming across popup and options page.
 */
export function levelToColor(level: StabilityLevel): string {
  const map: Record<StabilityLevel, string> = {
    excellent: '#22c55e', // green-500
    good: '#84cc16',     // lime-500
    fair: '#eab308',     // yellow-500
    poor: '#f97316',     // orange-500
    critical: '#ef4444', // red-500
  };
  return map[level];
}

/**
 * Returns a locale-friendly display label for each stability level.
 */
export function levelToLabel(level: StabilityLevel): string {
  const map: Record<StabilityLevel, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    critical: 'Critical',
  };
  return map[level];
}

// ---------------------------------------------------------------------------
// Browser / Runtime Detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the code is running inside a Firefox extension context.
 * Used to gate Firefox-specific API paths (e.g., `browser.scripting` vs
 * Manifest background scripts array).
 */
export function isFirefox(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('firefox')
  );
}

/**
 * Returns true when `chrome.storage.session` is available (Chrome 102+).
 * Falls back gracefully to `chrome.storage.local` when absent.
 */
export function hasSessionStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage !== null &&
    'session' in chrome.storage
  );
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a duration in seconds as `m:ss` (e.g. 125 → "2:05").
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats a bitrate in kbps with an appropriate unit suffix.
 * Values ≥ 1000 kbps are rendered as Mbps.
 */
export function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${round(kbps / 1000, 1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}

/**
 * Formats a buffer duration in seconds with one decimal place.
 */
export function formatBuffer(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '0.0s';
  }
  return `${seconds.toFixed(1)}s`;
}

/**
 * Returns a relative time string for a Unix timestamp (ms), e.g.
 * "just now", "5s ago", "2m ago".
 */
export function formatRelativeTime(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) {
    return 'just now';
  }
  if (delta < 60) {
    return `${delta}s ago`;
  }
  if (delta < 3600) {
    return `${Math.floor(delta / 60)}m ago`;
  }
  return `${Math.floor(delta / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Chrome Storage Wrappers
// ---------------------------------------------------------------------------

/**
 * Reads a value from the appropriate session-scoped storage.
 * Prefers `chrome.storage.session` on Chrome 102+; falls back to
 * `chrome.storage.local` on older Chrome and Firefox MV3.
 */
export async function sessionGet<T>(key: string): Promise<T | undefined> {
  const store = hasSessionStorage()
    ? chrome.storage.session
    : chrome.storage.local;
  const result = await store.get(key);
  return result[key] as T | undefined;
}

/**
 * Writes a value to the appropriate session-scoped storage.
 */
export async function sessionSet(key: string, value: unknown): Promise<void> {
  const store = hasSessionStorage()
    ? chrome.storage.session
    : chrome.storage.local;
  await store.set({ [key]: value });
}

/**
 * Removes a key from the appropriate session-scoped storage.
 */
export async function sessionRemove(key: string): Promise<void> {
  const store = hasSessionStorage()
    ? chrome.storage.session
    : chrome.storage.local;
  await store.remove(key);
}

// ---------------------------------------------------------------------------
// Miscellaneous
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type-safe shallow merge for plain objects.
 */
export function shallowMerge<T extends object>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch };
}

/**
 * Extracts the hostname from a URL string, returning an empty string on
 * parse failure.
 */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
