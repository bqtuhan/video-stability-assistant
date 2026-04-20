/**
 * Video Stability Assistant – Utility Function Tests
 *
 * Verifies all pure utility functions for numeric operations, formatting,
 * scoring helpers, browser detection, and storage wrappers.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import {
  clamp,
  lerp,
  normalise,
  mean,
  variance,
  stddev,
  round,
  throttle,
  debounce,
  scoreToLevel,
  levelToColor,
  levelToLabel,
  formatDuration,
  formatBitrate,
  formatBuffer,
  formatRelativeTime,
  hostnameFromUrl,
  shallowMerge,
  sleep,
} from '../utils';

// ---------------------------------------------------------------------------
// Numeric Utilities
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('clamps below minimum', () => expect(clamp(-5, 0, 100)).toBe(0));
  it('clamps above maximum', () => expect(clamp(150, 0, 100)).toBe(100));
  it('passes through in-range values', () => expect(clamp(50, 0, 100)).toBe(50));
  it('handles degenerate range (min === max)', () => expect(clamp(50, 10, 10)).toBe(10));
});

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(10, 20, 0)).toBe(10));
  it('returns b at t=1', () => expect(lerp(10, 20, 1)).toBe(20));
  it('returns midpoint at t=0.5', () => expect(lerp(10, 20, 0.5)).toBe(15));
  it('clamps t to [0,1]', () => expect(lerp(10, 20, 2)).toBe(20));
});

describe('normalise', () => {
  it('maps minimum to outMin', () => expect(normalise(0, 0, 100)).toBe(0));
  it('maps maximum to outMax', () => expect(normalise(100, 0, 100)).toBe(100));
  it('maps midpoint correctly', () => expect(normalise(50, 0, 100)).toBe(50));
  it('returns outMin for degenerate input range', () => expect(normalise(5, 5, 5)).toBe(0));
  it('supports custom output range', () => expect(normalise(0, 0, 100, 10, 110)).toBe(10));
});

describe('mean', () => {
  it('returns 0 for empty array', () => expect(mean([])).toBe(0));
  it('returns the single value for a one-element array', () => expect(mean([42])).toBe(42));
  it('computes correct mean', () => expect(mean([1, 2, 3, 4, 5])).toBe(3));
});

describe('variance', () => {
  it('returns 0 for arrays with fewer than 2 elements', () => {
    expect(variance([])).toBe(0);
    expect(variance([5])).toBe(0);
  });
  it('returns 0 for a constant array', () => expect(variance([4, 4, 4])).toBe(0));
  it('returns correct population variance', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → variance = 4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 5);
  });
});

describe('stddev', () => {
  it('returns 0 for a constant array', () => expect(stddev([3, 3, 3])).toBe(0));
  it('returns the square root of variance', () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(stddev(data)).toBeCloseTo(2, 5);
  });
});

describe('round', () => {
  it('rounds to 2 decimal places by default', () => expect(round(3.14159)).toBe(3.14));
  it('rounds to 0 decimal places', () => expect(round(3.7, 0)).toBe(4));
  it('rounds to 3 decimal places', () => expect(round(1.23456, 3)).toBe(1.235));
});

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

describe('throttle', () => {
  it('allows the first call immediately', () => {
    const calls: number[] = [];
    const fn = throttle((n: unknown) => calls.push(n as number), 100);
    fn(1);
    expect(calls).toEqual([1]);
  });

  it('suppresses a second call within the interval', () => {
    const calls: number[] = [];
    const fn = throttle((n: unknown) => calls.push(n as number), 200);
    fn(1);
    fn(2);
    expect(calls).toEqual([1]);
  });
});

describe('debounce', () => {
  it('delays execution until after the wait period', async () => {
    const calls: number[] = [];
    const fn = debounce((n: unknown) => calls.push(n as number), 50);
    fn(1);
    fn(2);
    fn(3);
    expect(calls).toHaveLength(0);
    await sleep(80);
    expect(calls).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// Stability Score Helpers
// ---------------------------------------------------------------------------

describe('scoreToLevel', () => {
  it.each([
    [100, 'excellent'],
    [85,  'excellent'],
    [84,  'good'],
    [65,  'good'],
    [64,  'fair'],
    [45,  'fair'],
    [44,  'poor'],
    [25,  'poor'],
    [24,  'critical'],
    [0,   'critical'],
  ])('score %i → level "%s"', (score, expected) => {
    expect(scoreToLevel(score)).toBe(expected);
  });
});

describe('levelToColor', () => {
  it('returns a hex colour for each level', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;
    for (const level of levels) {
      const color = levelToColor(level);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('levelToLabel', () => {
  it('returns a capitalised string for each level', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;
    for (const level of levels) {
      const label = levelToLabel(level);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toMatch(/[A-Z]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats 0 seconds', () => expect(formatDuration(0)).toBe('0:00'));
  it('formats 65 seconds as 1:05', () => expect(formatDuration(65)).toBe('1:05'));
  it('formats 3661 seconds', () => expect(formatDuration(3661)).toBe('61:01'));
  it('handles negative values', () => expect(formatDuration(-1)).toBe('--:--'));
  it('handles Infinity', () => expect(formatDuration(Infinity)).toBe('--:--'));
});

describe('formatBitrate', () => {
  it('formats sub-1000 kbps with kbps suffix', () => {
    expect(formatBitrate(500)).toBe('500 kbps');
  });
  it('formats >= 1000 kbps with Mbps suffix', () => {
    expect(formatBitrate(2500)).toBe('2.5 Mbps');
  });
  it('rounds kbps to integers', () => {
    expect(formatBitrate(999.9)).toBe('1000 kbps');
  });
});

describe('formatBuffer', () => {
  it('formats with one decimal place', () => expect(formatBuffer(15.678)).toBe('15.7s'));
  it('formats zero correctly', () => expect(formatBuffer(0)).toBe('0.0s'));
  it('handles negative input', () => expect(formatBuffer(-1)).toBe('0.0s'));
});

describe('formatRelativeTime', () => {
  const NOW = Date.now();
  it('returns "just now" for < 5s', () => expect(formatRelativeTime(NOW - 3000)).toBe('just now'));
  it('returns seconds ago for < 60s', () => expect(formatRelativeTime(NOW - 30_000)).toMatch(/\ds ago/));
  it('returns minutes ago for < 3600s', () => expect(formatRelativeTime(NOW - 120_000)).toMatch(/\dm ago/));
  it('returns hours ago for >= 3600s', () => expect(formatRelativeTime(NOW - 7_200_000)).toMatch(/\dh ago/));
});

// ---------------------------------------------------------------------------
// URL Helpers
// ---------------------------------------------------------------------------

describe('hostnameFromUrl', () => {
  it('extracts hostname from a valid URL', () => {
    expect(hostnameFromUrl('https://www.youtube.com/watch?v=abc')).toBe('www.youtube.com');
  });
  it('returns empty string for an invalid URL', () => {
    expect(hostnameFromUrl('not-a-url')).toBe('');
  });
  it('handles URLs without paths', () => {
    expect(hostnameFromUrl('https://example.com')).toBe('example.com');
  });
});

// ---------------------------------------------------------------------------
// Object Helpers
// ---------------------------------------------------------------------------

describe('shallowMerge', () => {
  it('merges patch properties over base', () => {
    const base  = { a: 1, b: 2, c: 3 };
    const patch = { b: 99 };
    expect(shallowMerge(base, patch)).toEqual({ a: 1, b: 99, c: 3 });
  });
  it('does not mutate the base object', () => {
    const base  = { a: 1 };
    const patch = { a: 2 };
    const result = shallowMerge(base, patch);
    expect(base.a).toBe(1);
    expect(result.a).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Async Helpers
// ---------------------------------------------------------------------------

describe('sleep', () => {
  it('resolves after approximately the specified delay', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
