/**
 * Video Stability Assistant – Advisory Engine
 *
 * Evaluates the current metrics snapshot and stability score against a
 * prioritised rule set to produce a ranked list of actionable advisories.
 * Rules are expressed as pure functions — no side effects — making the
 * engine trivially testable and auditable.
 *
 * Advisory codes are stable string identifiers safe for use as i18n keys
 * and for deduplication across polling cycles.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type {
  Advisory,

  VideoMetrics,
  StabilityScore,
  PlaybackMode,
  Language,
  AdvisoryMode,
} from '../types';
import { getAdvisoryTranslation } from '../i18n';

// ---------------------------------------------------------------------------
// Advisory Definitions
// ---------------------------------------------------------------------------

/**
 * Internal rule definition.  A rule fires when its `condition` returns true
 * and produces the advisory returned by `build`.
 */
interface AdvisoryRule {
  /** Stable identifier; becomes the advisory `code`. */
  id: string;
  /** Evaluation priority (lower = checked first; only the top-N fire). */
  priority: number;
  condition: (ctx: EvaluationContext) => boolean;
  build: (ctx: EvaluationContext) => Advisory;
}

/** All data available to a rule at evaluation time. */
interface EvaluationContext {
  metrics: VideoMetrics;
  score: StabilityScore;
  mode: PlaybackMode;
  language: Language;
  advisoryMode: AdvisoryMode;
  nowMs: number;
}

// ---------------------------------------------------------------------------
// Helper Predicates
// ---------------------------------------------------------------------------

function dropRatePct(m: VideoMetrics): number {
  if (m.totalFrames <= 0) {
    return 0;
  }
  return (m.droppedFrames / m.totalFrames) * 100;
}

function secondsSinceStall(m: VideoMetrics, nowMs: number): number {
  if (m.lastStallTimestamp === 0) {
    return Infinity;
  }
  return (nowMs - m.lastStallTimestamp) / 1000;
}

function bandwidthDeficit(m: VideoMetrics): number {
  if (m.bandwidth <= 0 || m.bitrate <= 0) {
    return 0;
  }
  return Math.max(0, m.bitrate - m.bandwidth);
}

// ---------------------------------------------------------------------------
// Rule Registry
// ---------------------------------------------------------------------------

const RULES: AdvisoryRule[] = [
  // ── Critical: Immediate Playback Failure Risk ────────────────────────────

  {
    id: 'BUFFER_CRITICAL',
    priority: 10,
    condition: ({ metrics }) => metrics.bufferAhead < 2 && !metrics.paused,
    build: ({ language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('BUFFER_CRITICAL', language, advisoryMode);
      return {
        code: 'BUFFER_CRITICAL',
        title: trans.title,
        severity: 'critical',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'STALL_RECENT',
    priority: 20,
    condition: ({ metrics, nowMs }) =>
      metrics.stallCount > 0 && secondsSinceStall(metrics, nowMs) < 30,
    build: ({ metrics, nowMs, language, advisoryMode }) => {
      const secs = Math.round(secondsSinceStall(metrics, nowMs));
      const trans = getAdvisoryTranslation('STALL_RECENT', language, advisoryMode, {
        secs,
        stallCount: metrics.stallCount,
      });
      return {
        code: 'STALL_RECENT',
        title: trans.title,
        severity: 'critical',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'BANDWIDTH_DEFICIT',
    priority: 25,
    condition: ({ metrics }) => bandwidthDeficit(metrics) > 500,
    build: ({ metrics, language, advisoryMode }) => {
      const deficit = Math.round(bandwidthDeficit(metrics));
      const trans = getAdvisoryTranslation('BANDWIDTH_DEFICIT', language, advisoryMode, {
        bitrate: Math.round(metrics.bitrate),
        bandwidth: Math.round(metrics.bandwidth),
        deficit,
      });
      return {
        code: 'BANDWIDTH_DEFICIT',
        title: trans.title,
        severity: 'critical',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  // ── Warning: Degraded Quality ────────────────────────────────────────────

  {
    id: 'DROP_RATE_HIGH',
    priority: 30,
    condition: ({ metrics }) => dropRatePct(metrics) >= 5,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('DROP_RATE_HIGH', language, advisoryMode, {
        dropRate: dropRatePct(metrics).toFixed(1),
      });
      return {
        code: 'DROP_RATE_HIGH',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'BUFFER_LOW',
    priority: 35,
    condition: ({ metrics }) =>
      metrics.bufferAhead >= 2 && metrics.bufferAhead < 8 && !metrics.paused,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('BUFFER_LOW', language, advisoryMode, {
        buffer: metrics.bufferAhead.toFixed(1),
      });
      return {
        code: 'BUFFER_LOW',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'BITRATE_UNSTABLE',
    priority: 40,
    condition: ({ score }) => score.factors.bitrateStability < 40,
    build: ({ language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('BITRATE_UNSTABLE', language, advisoryMode);
      return {
        code: 'BITRATE_UNSTABLE',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'DECODE_SLOW',
    priority: 45,
    condition: ({ metrics }) => metrics.decodeTime > 50,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('DECODE_SLOW', language, advisoryMode, {
        decodeTime: metrics.decodeTime.toFixed(1),
      });
      return {
        code: 'DECODE_SLOW',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'STALL_RECURRING',
    priority: 50,
    condition: ({ metrics, nowMs }) =>
      metrics.stallCount >= 3 && secondsSinceStall(metrics, nowMs) < 300,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('STALL_RECURRING', language, advisoryMode, {
        stallCount: metrics.stallCount,
        stallDuration: (metrics.totalStallDuration / 1000).toFixed(1),
      });
      return {
        code: 'STALL_RECURRING',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  // ── Info: Informational / Optimisation Opportunities ─────────────────────

  {
    id: 'SCORE_GOOD',
    priority: 100,
    condition: ({ score }) => score.overall >= 85,
    build: ({ language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('SCORE_GOOD', language, advisoryMode);
      return {
        code: 'SCORE_GOOD',
        title: trans.title,
        severity: 'info',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'LOW_READYSTATE',
    priority: 15,
    condition: ({ metrics }) =>
      !metrics.paused && metrics.readyState < 3,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('LOW_READYSTATE', language, advisoryMode, {
        readyState: metrics.readyState,
      });
      return {
        code: 'LOW_READYSTATE',
        title: trans.title,
        severity: 'warning',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'HIGH_PLAYBACK_RATE',
    priority: 60,
    condition: ({ metrics }) => metrics.playbackRate > 1.5,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('HIGH_PLAYBACK_RATE', language, advisoryMode, {
        rate: metrics.playbackRate,
      });
      return {
        code: 'HIGH_PLAYBACK_RATE',
        title: trans.title,
        severity: 'info',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },

  {
    id: 'LIVE_BUFFER_LARGE',
    priority: 65,
    condition: ({ metrics, mode }) =>
      mode === 'live' && metrics.bufferAhead > 20,
    build: ({ metrics, language, advisoryMode }) => {
      const trans = getAdvisoryTranslation('LIVE_BUFFER_LARGE', language, advisoryMode, {
        buffer: metrics.bufferAhead.toFixed(0),
      });
      return {
        code: 'LIVE_BUFFER_LARGE',
        title: trans.title,
        severity: 'info',
        description: trans.description,
        actions: trans.actions,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates all rules against the provided context and returns a list of
 * advisories, sorted by priority.
 *
 * @param metrics       Latest metrics snapshot.
 * @param score         Current stability score.
 * @param mode          Playback mode.
 * @param language      Current language ('en' | 'tr').
 * @param advisoryMode  Advisory mode ('simple' | 'technical').
 * @param nowMs         Current wall-clock time.
 * @param limit         Maximum number of advisories to return (default: 3).
 */
export function getAdvisories(
  metrics: VideoMetrics,
  score: StabilityScore,
  mode: PlaybackMode = 'balanced',
  language: Language = 'en',
  advisoryMode: AdvisoryMode = 'simple',
  nowMs = Date.now(),
  limit = 3,
): Advisory[] {
  const ctx: EvaluationContext = { metrics, score, mode, language, advisoryMode, nowMs };

  return RULES.filter((rule) => rule.condition(ctx))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit)
    .map((rule) => rule.build(ctx));
}

/**
 * Returns the highest severity level found in an array of advisories.
 * Returns null if the array is empty.
 */
export function highestSeverity(advisories: Advisory[]): Advisory['severity'] | null {
  if (advisories.length === 0) {
    return null;
  }
  const ranks: Record<Advisory['severity'], number> = {
    critical: 2,
    warning: 1,
    info: 0,
  };
  return advisories.reduce((highest, current) => {
    return ranks[current.severity] > ranks[highest.severity] ? current : highest;
  }).severity;
}

/**
 * Returns an array of advisory codes that are present in `current` but not in `previous`.
 */
export function newAdvisoryCodes(previous: Advisory[], current: Advisory[]): string[] {
  const prevCodes = new Set(previous.map((a) => a.code));
  return current
    .filter((a) => !prevCodes.has(a.code))
    .map((a) => a.code);
}
