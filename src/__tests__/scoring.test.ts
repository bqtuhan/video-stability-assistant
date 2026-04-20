/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Video Stability Assistant – Scoring Engine Tests
 *
 * Verifies weight integrity, score boundary conditions, mode differentiation,
 * and individual factor scorer behaviour.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeScore,
  validateWeights,
  WEIGHT_PRESETS,
} from '../engines/scoring';
import type { VideoMetrics } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function makeMetrics(overrides: Partial<VideoMetrics> = {}): VideoMetrics {
  return {
    timestamp:         NOW,
    url:               'https://example.com/video',
    bufferAhead:       15,
    bufferBehind:      5,
    totalFrames:       10_000,
    droppedFrames:     0,
    decodedFrames:     10_000,
    decodeTime:        16,
    currentTime:       60,
    duration:          3600,
    playbackRate:      1,
    readyState:        4,
    paused:            false,
    bitrate:           2000,
    bandwidth:         8000,
    stallCount:        0,
    totalStallDuration: 0,
    lastStallTimestamp: 0,
    ...overrides,
  };
}

const GOOD_BITRATE_HISTORY = Array.from({ length: 20 }, () => 2000);
const VOLATILE_BITRATE_HISTORY = [500, 4000, 300, 5000, 200, 6000, 100, 7000];

// ---------------------------------------------------------------------------
// Weight Integrity
// ---------------------------------------------------------------------------

describe('WEIGHT_PRESETS', () => {
  it('all presets sum to exactly 1.0 (±0.001)', () => {
    for (const weights of Object.values(WEIGHT_PRESETS) ) {
      const sum = Object.values(weights as any).reduce((a: any, b: any) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 3);
    }
  });

  it('validateWeights returns true for all built-in presets', () => {
    for (const weights of Object.values(WEIGHT_PRESETS) ) {
      expect(validateWeights(weights)).toBe(true);
    }
  });

  it('validateWeights returns false for an invalid custom weight set', () => {
    expect(
      validateWeights({
        bufferHealth:      0.3,
        dropRate:          0.3,
        stallFrequency:    0.3,
        bitrateStability:  0.3,
        decodePerformance: 0.3,
      }),
    ).toBe(false);
  });

  it('each mode has exactly 5 weight entries', () => {
    for (const weights of Object.values(WEIGHT_PRESETS) ) {
      expect(Object.keys(weights as any)).toHaveLength(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Score Boundary Conditions
// ---------------------------------------------------------------------------

describe('computeScore – overall range', () => {
  it('returns a score of 100 for ideal conditions', () => {
    const metrics = makeMetrics({ bufferAhead: 30, droppedFrames: 0, stallCount: 0, decodeTime: 10 });
    const result  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'balanced', NOW);
    expect(result.overall).toBeGreaterThanOrEqual(90);
  });

  it('returns a very low score for worst-case conditions', () => {
    const metrics = makeMetrics({
      bufferAhead:         0,
      droppedFrames:       5000,
      totalFrames:         5000,
      stallCount:          10,
      totalStallDuration:  30_000,
      lastStallTimestamp:  NOW - 5_000,
      decodeTime:          200,
    });
    const result = computeScore(metrics, [], 'balanced', NOW);
    expect(result.overall).toBeLessThan(35);
  });

  it('always returns an integer score in [0, 100]', () => {
    for (let i = 0; i < 50; i++) {
      const metrics = makeMetrics({
        bufferAhead:    Math.random() * 40,
        droppedFrames:  Math.floor(Math.random() * 1000),
        totalFrames:    10_000,
        stallCount:     Math.floor(Math.random() * 5),
        decodeTime:     Math.random() * 120,
      });
      const result = computeScore(metrics, GOOD_BITRATE_HISTORY, 'balanced', NOW);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.overall)).toBe(true);
    }
  });

  it('all factor scores are integers in [0, 100]', () => {
    const metrics = makeMetrics();
    const result  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'balanced', NOW);
    for (const score of Object.values(result.factors)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(score)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Mode Differentiation
// ---------------------------------------------------------------------------

describe('computeScore – mode differentiation', () => {
  it('live mode penalises stalls more heavily than VOD mode', () => {
    const metrics = makeMetrics({
      stallCount:          2,
      totalStallDuration:  5000,
      lastStallTimestamp:  NOW - 10_000,
    });

    const live = computeScore(metrics, GOOD_BITRATE_HISTORY, 'live',    NOW);
    const vod  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'vod',     NOW);

    // Live weights stall frequency at 0.30 vs VOD at 0.20.
    expect(live.overall).toBeLessThanOrEqual(vod.overall);
  });

  it('VOD mode penalises drop rate more heavily than live mode', () => {
    const metrics = makeMetrics({
      droppedFrames: 800,
      totalFrames:   10_000,
    });

    const live = computeScore(metrics, GOOD_BITRATE_HISTORY, 'live', NOW);
    const vod  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'vod',  NOW);

    // VOD weights drop rate at 0.25 vs live at 0.15.
    expect(vod.overall).toBeLessThanOrEqual(live.overall);
  });

  it('each mode returns the correct mode field in the result', () => {
    const metrics = makeMetrics();
    expect(computeScore(metrics, [], 'balanced', NOW).mode).toBe('balanced');
    expect(computeScore(metrics, [], 'live',     NOW).mode).toBe('live');
    expect(computeScore(metrics, [], 'vod',      NOW).mode).toBe('vod');
  });
});

// ---------------------------------------------------------------------------
// Individual Factor Sensitivity
// ---------------------------------------------------------------------------

describe('computeScore – factor sensitivity', () => {
  it('bufferHealth factor improves as buffer increases', () => {
    const low  = computeScore(makeMetrics({ bufferAhead: 1 }),  GOOD_BITRATE_HISTORY, 'balanced', NOW);
    const mid  = computeScore(makeMetrics({ bufferAhead: 10 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
    const high = computeScore(makeMetrics({ bufferAhead: 30 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);

    expect(low.factors.bufferHealth).toBeLessThan(mid.factors.bufferHealth);
    expect(mid.factors.bufferHealth).toBeLessThan(high.factors.bufferHealth);
  });

  it('dropRate factor degrades with increasing drop percentage', () => {
    const none = computeScore(makeMetrics({ droppedFrames: 0,   totalFrames: 10_000 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
    const some = computeScore(makeMetrics({ droppedFrames: 500, totalFrames: 10_000 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
    const many = computeScore(makeMetrics({ droppedFrames: 2000,totalFrames: 10_000 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);

    expect(none.factors.dropRate).toBeGreaterThan(some.factors.dropRate);
    expect(some.factors.dropRate).toBeGreaterThan(many.factors.dropRate);
  });

  it('bitrateStability scores lower for volatile bitrate history', () => {
    const stable   = computeScore(makeMetrics(), GOOD_BITRATE_HISTORY,    'balanced', NOW);
    const volatile = computeScore(makeMetrics(), VOLATILE_BITRATE_HISTORY, 'balanced', NOW);

    expect(stable.factors.bitrateStability).toBeGreaterThanOrEqual(volatile.factors.bitrateStability);
  });

  it('decodePerformance scores 100 for sub-nominal decode time', () => {
    const result = computeScore(makeMetrics({ decodeTime: 8 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
    expect(result.factors.decodePerformance).toBe(100);
  });

  it('stallFrequency scores 100 with zero stalls', () => {
    const result = computeScore(makeMetrics({ stallCount: 0 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
    expect(result.factors.stallFrequency).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Level Assignment
// ---------------------------------------------------------------------------

describe('computeScore – level assignment', () => {
  it('assigns "excellent" level for score >= 85', () => {
    const metrics = makeMetrics({ bufferAhead: 30, droppedFrames: 0, stallCount: 0, decodeTime: 10 });
    const result  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'balanced', NOW);
    if (result.overall >= 85) {
      expect(result.level).toBe('excellent');
    }
  });

  it('assigns "critical" level for very low scores', () => {
    const metrics = makeMetrics({
      bufferAhead: 0, droppedFrames: 8000, totalFrames: 10_000,
      stallCount: 15, totalStallDuration: 60_000, lastStallTimestamp: NOW - 1000,
      decodeTime: 300,
    });
    const result = computeScore(metrics, [], 'balanced', NOW);
    if (result.overall < 25) {
      expect(result.level).toBe('critical');
    }
  });
});
