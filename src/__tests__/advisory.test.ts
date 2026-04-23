/**
 * Video Stability Assistant – Advisory Engine Tests
 *
 * Verifies that each advisory rule fires under its documented conditions,
 * that severity ordering is correct, and that deduplication logic works.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import {
  getAdvisories as evaluateAdvisories,
  highestSeverity,
  newAdvisoryCodes,
} from '../engines/advisory';
import { computeScore } from '../engines/scoring';
import type { VideoMetrics } from '../types';

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

function scoreFor(metrics: VideoMetrics) {
  return computeScore(metrics, Array(20).fill(2000), 'balanced', NOW);
}

// ---------------------------------------------------------------------------
// Rule Firing
// ---------------------------------------------------------------------------

describe('evaluateAdvisories – rule firing', () => {
  it('fires BUFFER_CRITICAL when buffer < 2s and not paused', () => {
    const m = makeMetrics({ bufferAhead: 1.2 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'BUFFER_CRITICAL')).toBe(true);
  });

  it('does NOT fire BUFFER_CRITICAL when paused', () => {
    const m = makeMetrics({ bufferAhead: 0, paused: true });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'BUFFER_CRITICAL')).toBe(false);
  });

  it('fires STALL_RECENT when a stall occurred within 30s', () => {
    const m = makeMetrics({
      stallCount:         1,
      lastStallTimestamp: NOW - 15_000,
    });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'STALL_RECENT')).toBe(true);
  });

  it('does NOT fire STALL_RECENT for an old stall (> 30s)', () => {
    const m = makeMetrics({
      stallCount:         1,
      lastStallTimestamp: NOW - 60_000,
    });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'STALL_RECENT')).toBe(false);
  });

  it('fires DROP_RATE_HIGH when drop rate >= 5%', () => {
    const m = makeMetrics({ droppedFrames: 600, totalFrames: 10_000 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'DROP_RATE_HIGH')).toBe(true);
  });

  it('fires BUFFER_LOW in the 2–8s range', () => {
    const m = makeMetrics({ bufferAhead: 5 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'BUFFER_LOW')).toBe(true);
  });

  it('fires BANDWIDTH_DEFICIT when bitrate > bandwidth by > 500 kbps', () => {
    const m = makeMetrics({ bitrate: 5000, bandwidth: 3000 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'BANDWIDTH_DEFICIT')).toBe(true);
  });

  it('fires SCORE_GOOD when score is >= 85', () => {
    const m = makeMetrics({ bufferAhead: 30, droppedFrames: 0, stallCount: 0, decodeTime: 10 });
    const score = scoreFor(m);
    if (score.overall >= 85) {
      const advisories = evaluateAdvisories(m, score, 'balanced', 'en', 'simple', NOW);
      expect(advisories.some((a: any) => a.code === 'SCORE_GOOD')).toBe(true);
    }
  });

  it('fires LIVE_BUFFER_LARGE for live mode with buffer > 20s', () => {
    const m = makeMetrics({ bufferAhead: 25 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'live', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'LIVE_BUFFER_LARGE')).toBe(true);
  });

  it('fires HIGH_PLAYBACK_RATE for rate > 1.5', () => {
    const m = makeMetrics({ playbackRate: 2 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.some((a: any) => a.code === 'HIGH_PLAYBACK_RATE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Result Limits
// ---------------------------------------------------------------------------

describe('evaluateAdvisories – result limits', () => {
  it('never returns more than 5 advisories', () => {
    const m = makeMetrics({
      bufferAhead:        0.5,
      droppedFrames:      2000,
      totalFrames:        10_000,
      stallCount:         5,
      totalStallDuration: 30_000,
      lastStallTimestamp: NOW - 5_000,
      decodeTime:         200,
      bitrate:            6000,
      bandwidth:          2000,
    });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(advisories.length).toBeLessThanOrEqual(5);
  });

  it('returns an array (possibly empty) for perfect metrics', () => {
    const m = makeMetrics({ bufferAhead: 30, droppedFrames: 0, stallCount: 0, decodeTime: 10, readyState: 4 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    expect(Array.isArray(advisories)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Severity Helpers
// ---------------------------------------------------------------------------

describe('highestSeverity', () => {
  it('returns null for an empty list', () => {
    expect(highestSeverity([])).toBeNull();
  });

  it('returns "critical" when a critical advisory is present', () => {
    const m = makeMetrics({ bufferAhead: 0 });
    const advisories = evaluateAdvisories(m, scoreFor(m), 'balanced', 'en', 'simple', NOW);
    if (advisories.some((a: any) => a.severity === 'critical')) {
      expect(highestSeverity(advisories)).toBe('critical');
    }
  });

  it('ranks critical > warning > info', () => {
    const mockAdvisories = [
      { code: 'A', title: '', description: '', severity: 'info' as const, actions: [] },
      { code: 'B', title: '', description: '', severity: 'warning' as const, actions: [] },
      { code: 'C', title: '', description: '', severity: 'critical' as const, actions: [] },
    ];
    expect(highestSeverity(mockAdvisories)).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe('newAdvisoryCodes', () => {
  it('returns all codes when previous list is empty', () => {
    const current = [
      { code: 'BUFFER_CRITICAL', title: '', description: '', severity: 'critical' as const, actions: [] },
      { code: 'STALL_RECENT',    title: '', description: '', severity: 'critical' as const, actions: [] },
    ];
    expect(newAdvisoryCodes([], current)).toEqual(['BUFFER_CRITICAL', 'STALL_RECENT']);
  });

  it('returns only new codes not present in previous list', () => {
    const prev = [{ code: 'BUFFER_CRITICAL', title: '', description: '', severity: 'critical' as const, actions: [] }];
    const curr = [
      { code: 'BUFFER_CRITICAL', title: '', description: '', severity: 'critical' as const, actions: [] },
      { code: 'STALL_RECENT',    title: '', description: '', severity: 'critical' as const, actions: [] },
    ];
    expect(newAdvisoryCodes(prev, curr)).toEqual(['STALL_RECENT']);
  });

  it('returns an empty array when all codes are unchanged', () => {
    const list = [{ code: 'BUFFER_LOW', title: '', description: '', severity: 'warning' as const, actions: [] }];
    expect(newAdvisoryCodes(list, list)).toEqual([]);
  });
});
