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
  AdvisorySeverity,
  VideoMetrics,
  StabilityScore,
  PlaybackMode,
} from '../types';

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
    build: () => ({
      code: 'BUFFER_CRITICAL',
      title: 'Buffer Critically Low',
      severity: 'critical' as AdvisorySeverity,
      description:
        'Less than 2 seconds of content is buffered. A freeze or ' +
        'rebuffering event is imminent.',
      actions: [
        'Pause playback for 10–20 seconds to allow the buffer to rebuild.',
        'Lower the stream quality if your player provides a manual quality selector.',
        'Check for other bandwidth-intensive processes running on your device or network.',
        'If the problem persists, refresh the page.',
      ],
    }),
  },

  {
    id: 'STALL_RECENT',
    priority: 20,
    condition: ({ metrics, nowMs }) =>
      metrics.stallCount > 0 && secondsSinceStall(metrics, nowMs) < 30,
    build: ({ metrics, nowMs }) => {
      const secs = Math.round(secondsSinceStall(metrics, nowMs));
      return {
        code: 'STALL_RECENT',
        title: 'Recent Playback Stall',
        severity: 'critical' as AdvisorySeverity,
        description:
          `A playback freeze was detected ${secs}s ago ` +
          `(${metrics.stallCount} total stall${metrics.stallCount > 1 ? 's' : ''} this session). ` +
          'Continued stalls indicate network or decode instability.',
        actions: [
          'Reduce the playback quality to the next lower tier.',
          'Close other tabs or applications consuming bandwidth.',
          'Verify that no VPN or proxy is throttling your connection.',
          'Try switching to a wired connection if you are on Wi-Fi.',
        ],
      };
    },
  },

  {
    id: 'BANDWIDTH_DEFICIT',
    priority: 25,
    condition: ({ metrics }) => bandwidthDeficit(metrics) > 500,
    build: ({ metrics }) => {
      const deficit = Math.round(bandwidthDeficit(metrics));
      return {
        code: 'BANDWIDTH_DEFICIT',
        title: 'Bandwidth Insufficient for Current Bitrate',
        severity: 'critical' as AdvisorySeverity,
        description:
          `The stream requires ~${Math.round(metrics.bitrate)} kbps but only ` +
          `~${Math.round(metrics.bandwidth)} kbps is available ` +
          `(deficit: ${deficit} kbps). Rebuffering is highly likely.`,
        actions: [
          'Select a lower quality tier (720p → 480p, or equivalent).',
          'Pause any uploads or downloads running concurrently.',
          'Check whether your ISP is currently experiencing congestion.',
        ],
      };
    },
  },

  // ── Warning: Degraded Quality ────────────────────────────────────────────

  {
    id: 'DROP_RATE_HIGH',
    priority: 30,
    condition: ({ metrics }) => dropRatePct(metrics) >= 5,
    build: ({ metrics }) => ({
      code: 'DROP_RATE_HIGH',
      title: 'High Frame Drop Rate',
      severity: 'warning' as AdvisorySeverity,
      description:
        `${dropRatePct(metrics).toFixed(1)}% of frames are being dropped, ` +
        'causing visible stuttering. This is typically a GPU decode or ' +
        'system-resource issue.',
      actions: [
        'Close other GPU-intensive applications (games, 3D modelling tools, etc.).',
        'Disable hardware acceleration in your browser and restart it.',
        'Lower playback resolution to reduce decode workload.',
        'Update your GPU drivers if they have not been updated recently.',
      ],
    }),
  },

  {
    id: 'BUFFER_LOW',
    priority: 35,
    condition: ({ metrics }) =>
      metrics.bufferAhead >= 2 && metrics.bufferAhead < 8 && !metrics.paused,
    build: ({ metrics }) => ({
      code: 'BUFFER_LOW',
      title: 'Buffer Running Low',
      severity: 'warning' as AdvisorySeverity,
      description:
        `Only ${metrics.bufferAhead.toFixed(1)}s of content is buffered ahead. ` +
        'If network conditions worsen, a stall may occur.',
      actions: [
        'Pause briefly to allow additional content to buffer.',
        'Consider reducing stream quality one tier.',
      ],
    }),
  },

  {
    id: 'BITRATE_UNSTABLE',
    priority: 40,
    condition: ({ score }) => score.factors.bitrateStability < 40,
    build: () => ({
      code: 'BITRATE_UNSTABLE',
      title: 'Unstable Bitrate',
      severity: 'warning' as AdvisorySeverity,
      description:
        `The stream bitrate is fluctuating significantly, causing the ` +
        `player's ABR algorithm to switch quality tiers frequently. ` +
        `This often results in visible quality oscillation.`,
      actions: [
        'If your player supports it, pin quality to a fixed tier.',
        'Move closer to your Wi-Fi access point or switch to a wired connection.',
        'Try a different CDN region if the platform supports edge selection.',
      ],
    }),
  },

  {
    id: 'DECODE_SLOW',
    priority: 45,
    condition: ({ metrics }) => metrics.decodeTime > 50,
    build: ({ metrics }) => ({
      code: 'DECODE_SLOW',
      title: 'Slow Frame Decode',
      severity: 'warning' as AdvisorySeverity,
      description:
        `Average frame decode time is ${metrics.decodeTime.toFixed(1)} ms, ` +
        'which exceeds the budget for smooth playback. This may cause ' +
        'stuttering even when the network is healthy.',
      actions: [
        'Enable hardware acceleration in your browser settings.',
        'Reduce playback resolution to lower decode complexity.',
        'Close other browser tabs and background applications.',
      ],
    }),
  },

  {
    id: 'STALL_RECURRING',
    priority: 50,
    condition: ({ metrics, nowMs }) =>
      metrics.stallCount >= 3 && secondsSinceStall(metrics, nowMs) < 300,
    build: ({ metrics }) => ({
      code: 'STALL_RECURRING',
      title: 'Recurring Stalls',
      severity: 'warning' as AdvisorySeverity,
      description:
        `${metrics.stallCount} stalls have occurred this session, ` +
        `accounting for ${(metrics.totalStallDuration / 1000).toFixed(1)}s of ` +
        'lost viewing time. A persistent network or server issue is likely.',
      actions: [
        'Run a speed test at fast.com or speedtest.net to assess your connection.',
        'Try refreshing the page to obtain a new CDN connection.',
        'Switch to an alternate network (mobile data vs Wi-Fi) to isolate the issue.',
      ],
    }),
  },

  // ── Info: Informational / Optimisation Opportunities ─────────────────────

  {
    id: 'SCORE_GOOD',
    priority: 100,
    condition: ({ score }) => score.overall >= 85,
    build: () => ({
      code: 'SCORE_GOOD',
      title: 'Playback Stable',
      severity: 'info' as AdvisorySeverity,
      description:
        'All quality signals are within healthy thresholds. ' +
        'No action is required.',
      actions: [],
    }),
  },

  {
    id: 'LOW_READYSTATE',
    priority: 15,
    condition: ({ metrics }) =>
      !metrics.paused && metrics.readyState < 3,
    build: ({ metrics }) => ({
      code: 'LOW_READYSTATE',
      title: 'Player Not Ready',
      severity: 'warning' as AdvisorySeverity,
      description:
        `The media element is in readyState ${metrics.readyState} ` +
        '(insufficient data to play). The player may be waiting for the ' +
        'initial buffer fill.',
      actions: [
        'Wait for the initial load to complete.',
        'If loading stalls for more than 15 seconds, try refreshing.',
      ],
    }),
  },

  {
    id: 'HIGH_PLAYBACK_RATE',
    priority: 60,
    condition: ({ metrics }) => metrics.playbackRate > 1.5,
    build: ({ metrics }) => ({
      code: 'HIGH_PLAYBACK_RATE',
      title: 'Elevated Playback Speed',
      severity: 'info' as AdvisorySeverity,
      description:
        `Playback is running at ${metrics.playbackRate}×. Scores may be ` +
        'lower than at normal speed because buffering strategies are not ' +
        'calibrated for fast-forward playback.',
      actions: [
        'Stability scores at rates above 1.5× should be interpreted with caution.',
      ],
    }),
  },

  {
    id: 'LIVE_BUFFER_LARGE',
    priority: 65,
    condition: ({ metrics, mode }) =>
      mode === 'live' && metrics.bufferAhead > 20,
    build: ({ metrics }) => ({
      code: 'LIVE_BUFFER_LARGE',
      title: 'Live Stream Latency High',
      severity: 'info' as AdvisorySeverity,
      description:
        `${metrics.bufferAhead.toFixed(0)}s of buffer exists on a live stream. ` +
        'You may be watching significantly behind the live edge.',
      actions: [
        'Use the "go to live" button in your player to reduce latency.',
        'Refresh the page if the player does not provide a live-sync button.',
      ],
    }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates all rules against the provided context and returns a list of
 * advisories, sorted by priority.
 *
 * @param metrics  Latest metrics snapshot.
 * @param score    Current stability score.
 * @param mode     Playback mode.
 * @param nowMs    Current wall-clock time.
 * @param limit    Maximum number of advisories to return (default: 3).
 */
export function getAdvisories(
  metrics: VideoMetrics,
  score: StabilityScore,
  mode: PlaybackMode = 'balanced',
  nowMs = Date.now(),
  limit = 3,
): Advisory[] {
  const ctx: EvaluationContext = { metrics, score, mode, nowMs };

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
