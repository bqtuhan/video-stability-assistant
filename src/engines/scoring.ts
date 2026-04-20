/**
 * Video Stability Assistant – Stability Scoring Engine
 *
 * Computes a composite stability score (0–100) from five orthogonal quality
 * signals, each normalised to [0, 100] before being combined via a weighted
 * sum.  Three weight presets are provided — Balanced, Live, and VOD — each
 * calibrated to the latency and quality priorities of the respective playback
 * context.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type {
  VideoMetrics,
  ScoringWeights,
  ScoreFactors,
  StabilityScore,
  PlaybackMode,
} from '../types';
import { clamp, normalise, scoreToLevel } from '../utils';

// ---------------------------------------------------------------------------
// Weight Tables
// ---------------------------------------------------------------------------

/**
 * All weight sets are guaranteed to sum to 1.0 (verified by unit tests).
 * Editing these values requires re-running the scoring calibration suite.
 */
export const WEIGHT_PRESETS: Record<PlaybackMode, ScoringWeights> = {
  balanced: {
    bufferHealth: 0.25,
    dropRate: 0.20,
    stallFrequency: 0.25,
    bitrateStability: 0.15,
    decodePerformance: 0.15,
  },
  live: {
    bufferHealth: 0.30,
    dropRate: 0.15,
    stallFrequency: 0.30,
    bitrateStability: 0.10,
    decodePerformance: 0.15,
  },
  vod: {
    bufferHealth: 0.20,
    dropRate: 0.25,
    stallFrequency: 0.20,
    bitrateStability: 0.20,
    decodePerformance: 0.15,
  },
};

// ---------------------------------------------------------------------------
// Normalisation Thresholds
// ---------------------------------------------------------------------------

/**
 * Upper bound for buffer-ahead seconds that maps to a perfect (100) score.
 * Any buffer at or above this value is treated as fully healthy.
 */
const BUFFER_EXCELLENT_S = 30;

/**
 * Buffer-ahead seconds below which the score decays sharply.
 * (Matched to the typical ABR panic threshold of many players.)
 */
const BUFFER_CRITICAL_S = 2;

/**
 * Stall penalty per stall event in score points before weighting.
 * Stalls within the last 60 s are weighted 2× relative to older ones.
 */
const STALL_PENALTY_PER_EVENT = 20;

/**
 * Bitrate coefficient-of-variation (%) that represents worst-case instability.
 * CV = stddev / mean × 100.
 */
const BITRATE_CV_CRITICAL_PCT = 80;

/**
 * Decode-time (ms) that maps to a score of zero.
 * At 60fps a frame budget is ~16.67 ms; ≥100 ms indicates severe decode lag.
 */
const DECODE_TIME_CRITICAL_MS = 100;

// ---------------------------------------------------------------------------
// Sub-Factor Scorers
// ---------------------------------------------------------------------------

/**
 * Scores buffer health on a non-linear curve.
 *
 * [0, critical)      → linear 0–30 (danger zone)
 * [critical, 10s)    → linear 30–80
 * [10s, excellent]   → linear 80–100
 */
function scoreBufferHealth(bufferAheadS: number): number {
  if (bufferAheadS <= 0) {return 0;}
  if (bufferAheadS < BUFFER_CRITICAL_S) {
    return normalise(bufferAheadS, 0, BUFFER_CRITICAL_S, 0, 30);
  }
  if (bufferAheadS < 10) {
    return normalise(bufferAheadS, BUFFER_CRITICAL_S, 10, 30, 80);
  }
  return normalise(bufferAheadS, 10, BUFFER_EXCELLENT_S, 80, 100);
}

/**
 * Scores drop rate on an exponential-decay-inspired curve.
 * Even a 1% drop rate produces a noticeable score penalty.
 */
function scoreDropRate(
  droppedFrames: number,
  totalFrames: number,
): number {
  if (totalFrames <= 0) {return 100;}
  const pct = clamp((droppedFrames / totalFrames) * 100, 0, 100);
  if (pct === 0) {return 100;}
  // Non-linear: score halves for every ~5% drop rate
  const score = 100 * Math.exp(-0.14 * pct);
  return clamp(score, 0, 100);
}

/**
 * Scores stall frequency by penalising each stall event.
 * Recent stalls (within the last 60 s) incur a 2× penalty.
 */
function scoreStallFrequency(
  stallCount: number,
  totalStallDurationMs: number,
  lastStallTimestampMs: number,
  nowMs: number,
): number {
  if (stallCount === 0) {return 100;}

  const recencyMultiplier =
    nowMs - lastStallTimestampMs < 60_000 ? 2 : 1;

  // Combine stall count with duration fraction.
  const countPenalty = stallCount * STALL_PENALTY_PER_EVENT * recencyMultiplier;
  const durationPenalty = Math.min(totalStallDurationMs / 1000, 30) * 2;

  return clamp(100 - countPenalty - durationPenalty, 0, 100);
}

/**
 * Scores bitrate stability from a window of historical bitrate samples.
 * Uses coefficient of variation (CV = σ / μ) so the measure is
 * scale-independent.
 */
function scoreBitrateStability(bitrateHistory: number[]): number {
  const validSamples = bitrateHistory.filter((b) => b > 0);
  if (validSamples.length < 3) {return 85;} // Not enough data → optimistic default

  const mean = validSamples.reduce((s, v) => s + v, 0) / validSamples.length;
  if (mean === 0) {return 100;}

  const sd = Math.sqrt(
    validSamples.reduce((s, v) => s + (v - mean) ** 2, 0) / validSamples.length,
  );
  const cv = (sd / mean) * 100;

  return clamp(
    normalise(cv, 0, BITRATE_CV_CRITICAL_PCT, 100, 0),
    0,
    100,
  );
}

/**
 * Scores decode performance based on average decode time per frame.
 * A nominal 60fps decode time (~16.67 ms) scores 100; above
 * DECODE_TIME_CRITICAL_MS scores 0.
 */
function scoreDecodePerformance(decodeTimeMs: number): number {
  if (decodeTimeMs <= 0) {return 100;}
  const nominal = 1000 / 60; // ~16.67 ms
  if (decodeTimeMs <= nominal) {return 100;}
  return clamp(
    normalise(decodeTimeMs, nominal, DECODE_TIME_CRITICAL_MS, 100, 0),
    0,
    100,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a full {@link StabilityScore} from the current
 * {@link VideoMetrics} and a window of historical snapshots.
 *
 * @param metrics        Latest metrics snapshot from the tracker.
 * @param bitrateHistory Rolling window of bitrate values (kbps).
 * @param mode           Playback mode governing weight selection.
 * @param nowMs          Wall-clock time for recency calculations.
 */
export function computeScore(
  metrics: VideoMetrics,
  bitrateHistory: number[],
  mode: PlaybackMode = 'balanced',
  nowMs = Date.now(),
): StabilityScore {
  const weights = WEIGHT_PRESETS[mode];

  const factors: ScoreFactors = {
    bufferHealth: scoreBufferHealth(metrics.bufferAhead),
    dropRate: scoreDropRate(metrics.droppedFrames, metrics.totalFrames),
    stallFrequency: scoreStallFrequency(
      metrics.stallCount,
      metrics.totalStallDuration,
      metrics.lastStallTimestamp,
      nowMs,
    ),
    bitrateStability: scoreBitrateStability(bitrateHistory),
    decodePerformance: scoreDecodePerformance(metrics.decodeTime),
  };

  const overall = clamp(
    factors.bufferHealth * weights.bufferHealth +
      factors.dropRate * weights.dropRate +
      factors.stallFrequency * weights.stallFrequency +
      factors.bitrateStability * weights.bitrateStability +
      factors.decodePerformance * weights.decodePerformance,
    0,
    100,
  );

  return {
    overall: Math.round(overall),
    level: scoreToLevel(overall),
    factors: {
      bufferHealth: Math.round(factors.bufferHealth),
      dropRate: Math.round(factors.dropRate),
      stallFrequency: Math.round(factors.stallFrequency),
      bitrateStability: Math.round(factors.bitrateStability),
      decodePerformance: Math.round(factors.decodePerformance),
    },
    mode,
    timestamp: nowMs,
  };
}

/**
 * Returns the weight set for a given playback mode.
 * Useful for displaying weight configuration in the options UI.
 */
export function getWeights(mode: PlaybackMode): ScoringWeights {
  return { ...WEIGHT_PRESETS[mode] };
}

/**
 * Validates that all five weights in a preset sum to 1.0 (±0.001 tolerance).
 * Used in the options page to validate custom weight inputs.
 */
export function validateWeights(weights: ScoringWeights): boolean {
  const sum = Object.values(weights).reduce((s, v) => s + v, 0);
  return Math.abs(sum - 1.0) < 0.001;
}
