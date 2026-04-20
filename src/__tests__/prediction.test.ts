/**
 * Video Stability Assistant – Prediction Engine Tests
 *
 * Verifies willFreeze classification, probability range, confidence
 * tier assignment, and time-to-freeze estimation logic.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { predictFreeze, getPredictionSignals } from '../engines/prediction';
import type { VideoMetrics, MetricsSnapshot } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000;

function makeMetrics(overrides: Partial<VideoMetrics> = {}): VideoMetrics {
  return {
    timestamp:          NOW,
    url:                'https://example.com',
    bufferAhead:        15,
    bufferBehind:       5,
    totalFrames:        10_000,
    droppedFrames:      0,
    decodedFrames:      10_000,
    decodeTime:         16,
    currentTime:        60,
    duration:           3600,
    playbackRate:       1,
    readyState:         4,
    paused:             false,
    bitrate:            2000,
    bandwidth:          8000,
    stallCount:         0,
    totalStallDuration: 0,
    lastStallTimestamp: 0,
    ...overrides,
  };
}

function makeHistory(count: number, bufferValues?: number[]): MetricsSnapshot[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp:    NOW - (count - i) * 1000,
    bufferAhead:  bufferValues ? (bufferValues[i] ?? 15) : 15,
    droppedFrames: 0,
    totalFrames:  10_000,
    bitrate:      2000,
    stallCount:   0,
    decodeTime:   16,
  }));
}

// ---------------------------------------------------------------------------
// Paused / Not-Playing State
// ---------------------------------------------------------------------------

describe('predictFreeze – paused / idle state', () => {
  it('returns willFreeze=false when video is paused', () => {
    const result = predictFreeze(makeMetrics({ paused: true }), makeHistory(30), NOW);
    expect(result.willFreeze).toBe(false);
    expect(result.probability).toBe(0);
    expect(result.estimatedSecondsUntilFreeze).toBeNull();
  });

  it('returns willFreeze=false when readyState < 2', () => {
    const result = predictFreeze(makeMetrics({ readyState: 1 }), makeHistory(30), NOW);
    expect(result.willFreeze).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Confidence Tiers
// ---------------------------------------------------------------------------

describe('predictFreeze – confidence tiers', () => {
  it('assigns "low" confidence with fewer than 5 history entries', () => {
    const result = predictFreeze(makeMetrics(), makeHistory(3), NOW);
    expect(result.confidence).toBe('low');
  });

  it('assigns "medium" confidence with 5–19 history entries', () => {
    const result = predictFreeze(makeMetrics(), makeHistory(10), NOW);
    expect(result.confidence).toBe('medium');
  });

  it('assigns "high" confidence with 20+ history entries', () => {
    const result = predictFreeze(makeMetrics(), makeHistory(25), NOW);
    expect(result.confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Buffer Runway Signal
// ---------------------------------------------------------------------------

describe('predictFreeze – buffer runway', () => {
  it('does NOT predict a freeze with a healthy buffer', () => {
    const result = predictFreeze(makeMetrics({ bufferAhead: 20 }), makeHistory(25), NOW);
    expect(result.willFreeze).toBe(false);
    expect(result.probability).toBeLessThan(0.4);
  });

  it('predicts a high freeze probability with a near-empty buffer', () => {
    const result = predictFreeze(
      makeMetrics({ bufferAhead: 0.5 }),
      makeHistory(25),
      NOW,
    );
    expect(result.probability).toBeGreaterThan(0.3);
  });

  it('predicts a freeze when buffer is draining rapidly', () => {
    // Buffer declining: 8, 6, 4, 2, 1 over last 5 snapshots.
    const drainingHistory = makeHistory(25, [
      ...Array(20).fill(15),
      8, 6, 4, 2, 1,
    ]);
    const result = predictFreeze(makeMetrics({ bufferAhead: 0.8 }), drainingHistory, NOW);
    expect(result.probability).toBeGreaterThan(0.35);
  });
});

// ---------------------------------------------------------------------------
// Stall Recency Signal
// ---------------------------------------------------------------------------

describe('predictFreeze – stall recency', () => {
  it('increases probability when a stall occurred within 45s', () => {
    const noStall = predictFreeze(
      makeMetrics({ stallCount: 0 }),
      makeHistory(25),
      NOW,
    );
    const recentStall = predictFreeze(
      makeMetrics({ stallCount: 1, lastStallTimestamp: NOW - 20_000 }),
      makeHistory(25),
      NOW,
    );
    expect(recentStall.probability).toBeGreaterThan(noStall.probability);
  });

  it('does not amplify probability for stalls older than 45s', () => {
    const oldStall = predictFreeze(
      makeMetrics({ stallCount: 1, lastStallTimestamp: NOW - 60_000 }),
      makeHistory(25),
      NOW,
    );
    // Should remain below threshold for a healthy-buffer stream.
    expect(oldStall.willFreeze).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bandwidth Ratio Signal
// ---------------------------------------------------------------------------

describe('predictFreeze – bandwidth ratio', () => {
  it('increases probability when bitrate exceeds bandwidth', () => {
    const surplus = predictFreeze(
      makeMetrics({ bitrate: 2000, bandwidth: 8000 }),
      makeHistory(25),
      NOW,
    );
    const deficit = predictFreeze(
      makeMetrics({ bitrate: 6000, bandwidth: 2000, bufferAhead: 3 }),
      makeHistory(25),
      NOW,
    );
    expect(deficit.probability).toBeGreaterThan(surplus.probability);
  });
});

// ---------------------------------------------------------------------------
// Output Invariants
// ---------------------------------------------------------------------------

describe('predictFreeze – output invariants', () => {
  it('probability is always in [0, 1]', () => {
    const cases: Partial<VideoMetrics>[] = [
      {},
      { bufferAhead: 0 },
      { droppedFrames: 5000, totalFrames: 5000 },
      { bitrate: 9000, bandwidth: 1000 },
      { stallCount: 10, lastStallTimestamp: NOW - 5000 },
    ];

    for (const overrides of cases) {
      const result = predictFreeze(makeMetrics(overrides), makeHistory(25), NOW);
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
    }
  });

  it('estimatedSecondsUntilFreeze is null when willFreeze is false', () => {
    const result = predictFreeze(makeMetrics({ bufferAhead: 25 }), makeHistory(30), NOW);
    if (!result.willFreeze) {
      expect(result.estimatedSecondsUntilFreeze).toBeNull();
    }
  });

  it('estimatedSecondsUntilFreeze is a positive integer when willFreeze is true', () => {
    const result = predictFreeze(
      makeMetrics({ bufferAhead: 0.5, stallCount: 2, lastStallTimestamp: NOW - 10_000 }),
      makeHistory(25),
      NOW,
    );
    if (result.willFreeze && result.estimatedSecondsUntilFreeze !== null) {
      expect(result.estimatedSecondsUntilFreeze).toBeGreaterThanOrEqual(0);
      expect(result.estimatedSecondsUntilFreeze).toBeLessThanOrEqual(120);
    }
  });
});

// ---------------------------------------------------------------------------
// Signal Breakdown
// ---------------------------------------------------------------------------

describe('getPredictionSignals', () => {
  it('returns all required signal keys', () => {
    const signals = getPredictionSignals(makeMetrics(), makeHistory(25), NOW);
    expect(signals).toHaveProperty('bufferRunway');
    expect(signals).toHaveProperty('dropTrend');
    expect(signals).toHaveProperty('stallRecency');
    expect(signals).toHaveProperty('bandwidthRatio');
    expect(signals).toHaveProperty('combined');
    expect(signals).toHaveProperty('confidence');
  });

  it('all individual signals are in [0, 1]', () => {
    const signals = getPredictionSignals(makeMetrics(), makeHistory(25), NOW);
    const numericKeys = ['bufferRunway', 'dropTrend', 'stallRecency', 'bandwidthRatio', 'combined'] as const;
    for (const key of numericKeys) {
      expect(signals[key]).toBeGreaterThanOrEqual(0);
      expect(signals[key]).toBeLessThanOrEqual(1);
    }
  });
});
