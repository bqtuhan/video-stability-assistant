import { describe, it, expect } from '@jest/globals';
import { predictFreeze } from '../engines/prediction';
import type { VideoMetrics, MetricsSnapshot } from '../types';

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

describe('Prediction Engine', () => {
  it('predicts no freeze for healthy buffer', () => {
    const metrics = makeMetrics({ bufferAhead: 20 });
    const result = predictFreeze(metrics, [], NOW);
    expect(result.willFreeze).toBe(false);
  });

  it('predicts freeze for very low buffer', () => {
    const metrics = makeMetrics({ bufferAhead: 0.01 });
    const result = predictFreeze(metrics, [], NOW);
    expect(result.willFreeze).toBe(true);
  });

  it('adjusts confidence based on history length', () => {
    const metrics = makeMetrics();
    const lowConf = predictFreeze(metrics, [], NOW);
    expect(lowConf.confidence).toBe('low');

    const history: MetricsSnapshot[] = Array.from({ length: 25 }, (_, i) => ({
      timestamp: NOW - (25 - i) * 1000,
      bufferAhead: 10,
      droppedFrames: 0,
      totalFrames: 1000,
      bitrate: 2000,
      stallCount: 0,
      decodeTime: 10,
    }));
    const highConf = predictFreeze(metrics, history, NOW);
    expect(highConf.confidence).toBe('high');
  });

  it('returns willFreeze=false when video is paused', () => {
    const result = predictFreeze(makeMetrics({ paused: true }), [], NOW);
    expect(result.willFreeze).toBe(false);
    expect(result.probability).toBe(0);
  });
});
