import { describe, it, expect } from '@jest/globals';
import { computeScore, WEIGHT_PRESETS } from '../engines/scoring';
import type { VideoMetrics } from '../types';

const NOW = 1_700_000_000_000;

function makeMetrics(overrides: Partial<VideoMetrics> = {}): VideoMetrics {
  return {
    timestamp:          NOW,
    url:                'https://example.com/video',
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

const GOOD_BITRATE_HISTORY = Array.from({ length: 20 }, () => 2000);

describe('Scoring Engine', () => {
  describe('WEIGHT_PRESETS', () => {
    it('all presets sum to exactly 1.0 (±0.001)', () => {
      for (const weights of Object.values(WEIGHT_PRESETS)) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 3);
      }
    });
  });

  describe('computeScore', () => {
    it('returns a score of 100 for ideal conditions', () => {
      const metrics = makeMetrics({ bufferAhead: 30, droppedFrames: 0, stallCount: 0, decodeTime: 10 });
      const result  = computeScore(metrics, GOOD_BITRATE_HISTORY, 'balanced', NOW);
      expect(result.overall).toBeGreaterThanOrEqual(90);
    });

    it('returns a lower score for worst-case conditions', () => {
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
      expect(result.overall).toBeLessThan(60);
    });

    it('assigns correct levels', () => {
      const excellent = computeScore(makeMetrics({ bufferAhead: 30 }), GOOD_BITRATE_HISTORY, 'balanced', NOW);
      expect(excellent.level).toBe('excellent');

      const fair = computeScore(
        makeMetrics({ bufferAhead: 0, stallCount: 5, lastStallTimestamp: NOW - 1000 }),
        [],
        'balanced',
        NOW,
      );
      expect(fair.level).toBe('fair');
    });
  });
});
