/**
 * Video Stability Assistant – Shared Utilities v2.1
 * Includes a cross‑browser Shadow‑DOM traversal with API existence guards,
 * a requestIdleCallback polyfill, and throttle/debounce helpers.
 * @license Apache-2.0
 */
import type { StabilityLevel, LogEntry } from '../types';

// ── Numeric Helpers ──────────────────────────────────────────────
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  const clampedT = clamp(t, 0, 1);
  return a + (b - a) * clampedT;
}

export function normalise(value: number, min: number, max: number, targetMin = 0, targetMax = 100): number {
  if (max === min) return targetMin;
  const n = (value - min) / (max - min);
  return clamp(targetMin + n * (targetMax - targetMin), Math.min(targetMin, targetMax), Math.max(targetMin, targetMax));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ── Rate Limiting ────────────────────────────────────────────────
export function throttle<T extends (...args: any[]) => void>(fn: T, intervalMs: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delayMs);
  }) as T;
}

// ── requestIdleCallback Polyfill / Wrapper ─────────────────────
export function scheduleIdle(
  callback: (deadline: any) => void,
  options: { timeout?: number } = { timeout: 2000 },
): number {
  if (typeof (window as any).requestIdleCallback !== 'undefined') {
    return (window as any).requestIdleCallback(callback, options);
  }
  const start = Date.now();
  return window.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, 1);
}

export function cancelScheduleIdle(handle: number): void {
  if (typeof (window as any).cancelIdleCallback !== 'undefined') {
    (window as any).cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}

// ── Cross‑Browser Closed Shadow Root Access ────────────────────
function getShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  try {
    if (typeof chrome !== 'undefined' && (chrome as any).dom?.openOrClosedShadowRoot) {
      return (chrome as any).dom.openOrClosedShadowRoot(element);
    }
  } catch { /* ignore */ }
  try {
    const el = element as any;
    if (el.openOrClosedShadowRoot !== undefined) return el.openOrClosedShadowRoot;
  } catch { /* ignore */ }
  return null;
}

export function querySelectorAllDeep(root: Node, selector: string): Element[] {
  const results: Element[] = [];
  const visited = new WeakSet<Node>();

  function traverse(node: Node): void {
    if (visited.has(node)) return;
    visited.add(node);

    if (node instanceof Element) {
      if (node.matches(selector)) results.push(node);
      const shadow = getShadowRoot(node);
      if (shadow) traverse(shadow);
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      traverse(node.childNodes[i]);
    }

    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes();
      for (let i = 0; i < assigned.length; i++) traverse(assigned[i]);
    }
  }

  traverse(root);
  return results;
}

// ── Stability / Formatting Helpers ──────────────────
export function scoreToLevel(score: number): StabilityLevel {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  if (score >= 25) return 'poor';
  return 'critical';
}

export function levelToColor(level: StabilityLevel): string {
  switch (level) {
    case 'excellent': return '#10b981';
    case 'good': return '#34d399';
    case 'fair': return '#fbbf24';
    case 'poor': return '#f87171';
    case 'critical': return '#ef4444';
    default: return '#9ca3af';
  }
}

export function levelToLabel(level: StabilityLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function isFirefox(): boolean {
  return typeof (window as any).browser !== 'undefined' || /Firefox/.test(navigator.userAgent);
}

export function hasSessionStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!(chrome.storage as any).session;
}

export async function sessionGet<T>(key: string): Promise<T | undefined> {
  const store = hasSessionStorage() ? (chrome.storage as any).session : chrome.storage.local;
  const result = await store.get(key);
  return result[key] as T | undefined;
}

export async function sessionSet<T>(key: string, value: T): Promise<void> {
  const store = hasSessionStorage() ? (chrome.storage as any).session : chrome.storage.local;
  await store.set({ [key]: value });
}

export async function sessionRemove(key: string): Promise<void> {
  const store = hasSessionStorage() ? (chrome.storage as any).session : chrome.storage.local;
  await store.remove(key);
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBitrate(kbps: number): string {
  if (kbps >= 1000) return `${round(kbps / 1000, 1)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

export function formatBuffer(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0.0s';
  return `${seconds.toFixed(1)}s`;
}

export function formatRelativeTime(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function shallowMerge<T extends object>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch };
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function logEntriesToCSV(entries: LogEntry[]): string {
  const header = 'Timestamp,Score,Level,Bitrate,DroppedFrames,StallCount,BufferAhead\n';
  const rows = entries.map(e => 
    `${new Date(e.timestamp).toISOString()},${e.score},${e.level},${e.bitrate},${e.droppedFrames},${e.stallCount},${e.bufferAhead}`
  ).join('\n');
  return header + rows;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
