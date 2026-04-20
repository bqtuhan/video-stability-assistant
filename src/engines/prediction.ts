/**
 * Video Stability Assistant – Freeze Prediction Engine
 *
 * Implements the `willFreeze` algorithm originally developed in Archive A
 * and enhanced with multi-signal confidence scoring.  The predictor
 * combines four independent signals into a weighted probability estimate:
 *
 *  1. Buffer Runway  – How many seconds remain before the buffer is exhausted
 *                      at the current consumption rate.
 *  2. Drop Rate Trend – Whether dropped frames are accelerating (gradient
 *                       over the recent history window).
 *  3. Stall Recency  – Proximity of the most recent stall event to the
 *                      current moment indicates ongoing instability.
 *  4. Bandwidth Ratio – The ratio of current bitrate to available bandwidth;
 *                       a ratio > 1 means the network cannot keep up.
 *
 * The four signal probabilities are combined via a weighted geometric mean
 * to ensure that strong negative signals on any dimension are not masked by
 * high scores on others.
 *
 * Confidence is assigned based on history depth:
 *  • low    – fewer than 5 history snapshots
 *  • medium – 5–19 snapshots
 *  • high   – 20+ snapshots
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type {
  PredictionResult,
  VideoMetrics,
  MetricsSnapshot,
  PredictionConfidence,
} from '../types';
import { clamp, mean } from '../utils';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Probability threshold above which willFreeze is set to true. */
const FREEZE_PROBABILITY_THRESHOLD = 0.55;

/** Buffer runway (seconds) below which the buffer signal fires at maximum. */
const BUFFER_EXHAUSTION_CRITICAL_S = 3;

/** Drop-rate gradient (%/snapshot) above which the trend is considered severe. */
const DROP_GRADIENT_CRITICAL = 2.0;

/** Seconds since last stall within which the recency signal is at maximum. */
const STALL_RECENCY_WINDOW_S = 45;

/** Bandwidth ratio (bitrate / bandwidth) above which deficit is severe. */
const BANDWIDTH_RATIO_CRITICAL = 1.25;

// ---------------------------------------------------------------------------
// Signal Weights (must sum to 1.0)
// ---------------------------------------------------------------------------

const SIGNAL_WEIGHTS = {
  bufferRunway: 0.40,
  dropTrend: 0.20,
  stallRecency: 0.25,
  bandwidthRatio: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Individual Signal Estimators
// ---------------------------------------------------------------------------

/**
 * Estimates freeze probability from buffer runway.
 *
 * Models the expected time until buffer exhaustion given the current
 * consumption rate vs fill rate, then maps that to a probability.
 */
function bufferRunwaySignal(
  metrics: VideoMetrics,
  history: MetricsSnapshot[],
): number {
  const bufferAhead = metrics.bufferAhead;

  if (metrics.paused) {
    return 0;
  }
  if (bufferAhead <= 0) {
    return 1;
  }

  // Estimate buffer drain rate from recent history.
  let drainRate = 1.0; // Nominal: buffer drains at playback rate (1 s/s).

  if (history.length >= 3) {
    const recent = history.slice(-5);
    const deltas: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      const dtMs = current.timestamp - prev.timestamp;
      const dbuffer = prev.bufferAhead - current.bufferAhead;
      if (dtMs > 0) {
        deltas.push(dbuffer / (dtMs / 1000));
      }
    }
    if (deltas.length > 0) {
      drainRate = Math.max(0.1, mean(deltas));
    }
  }

  // Estimated seconds until buffer runs dry.
  const runwayS = drainRate > 0 ? bufferAhead / drainRate : bufferAhead;

  if (runwayS <= 0) {
    return 1;
  }
  if (runwayS >= BUFFER_EXHAUSTION_CRITICAL_S * 6) {
    return 0;
  }

  // Non-linear mapping: exponential decay as runway shrinks.
  const prob = Math.exp(-0.4 * (runwayS / BUFFER_EXHAUSTION_CRITICAL_S - 1));
  return clamp(prob, 0, 1);
}

/**
 * Estimates freeze probability from the drop-rate trend.
 *
 * Computes the per-snapshot gradient of dropped frames and maps an
 * increasing trend to higher freeze probability.
 */
function dropTrendSignal(history: MetricsSnapshot[]): number {
  if (history.length < 4) {
    return 0;
  }

  const recent = history.slice(-8);
  const gradients: number[] = [];

  for (let i = 1; i < recent.length; i++) {
    const current = recent[i];
    const prev = recent[i - 1];
    const totalDelta = current.totalFrames - prev.totalFrames;
    const dropDelta = current.droppedFrames - prev.droppedFrames;
    if (totalDelta > 0) {
      gradients.push((dropDelta / totalDelta) * 100);
    }
  }

  if (gradients.length < 2) {
    return 0;
  }

  // Linear regression slope over the gradient window.
  const n = gradients.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(gradients);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * ((gradients[i] || 0) - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Positive slope = drop rate is increasing.
  if (slope <= 0) {
    return 0;
  }
  return clamp(slope / DROP_GRADIENT_CRITICAL, 0, 1);
}

/**
 * Estimates freeze probability from stall recency.
 *
 * A recent stall is strong evidence that conditions are unstable and
 * another freeze is likely.
 */
function stallRecencySignal(
  metrics: VideoMetrics,
  nowMs: number,
): number {
  if (metrics.stallCount === 0 || metrics.lastStallTimestamp === 0) {
    return 0;
  }

  const secondsAgo = (nowMs - metrics.lastStallTimestamp) / 1000;
  if (secondsAgo >= STALL_RECENCY_WINDOW_S) {
    return 0;
  }

  // Linear decay from 1 (immediate) to 0 (at the window edge).
  const base = 1 - secondsAgo / STALL_RECENCY_WINDOW_S;

  // Amplify for repeated stalls.
  const repeatFactor = Math.min(metrics.stallCount / 3, 1);
  return clamp(base + repeatFactor * 0.3, 0, 1);
}

/**
 * Estimates freeze probability from the bandwidth deficit ratio.
 *
 * When the stream's required bitrate exceeds available bandwidth,
 * buffer drain is mathematically guaranteed over time.
 */
function bandwidthRatioSignal(metrics: VideoMetrics): number {
  if (metrics.bandwidth <= 0 || metrics.bitrate <= 0) {
    return 0;
  }

  const ratio = metrics.bitrate / metrics.bandwidth;
  if (ratio <= 0.8) {
    return 0;                       // Comfortable headroom
  }
  if (ratio >= BANDWIDTH_RATIO_CRITICAL) {
    return 1;  // Definite deficit
  }

  // Linear interpolation between safe (0.8) and critical (1.25).
  return normaliseRatio(ratio, 0.8, BANDWIDTH_RATIO_CRITICAL);
}

function normaliseRatio(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

// ---------------------------------------------------------------------------
// Probability Combiner
// ---------------------------------------------------------------------------

/**
 * Combines four independent signal probabilities via a weighted sum.
 * Signals are clamped to [0.01, 0.99] before combination to prevent
 * any single zero from collapsing the entire estimate.
 */
function combineSignals(signals: {
  bufferRunway: number;
  dropTrend: number;
  stallRecency: number;
  bandwidthRatio: number;
}): number {
  const w = SIGNAL_WEIGHTS;
  return clamp(
    signals.bufferRunway * w.bufferRunway +
      signals.dropTrend * w.dropTrend +
      signals.stallRecency * w.stallRecency +
      signals.bandwidthRatio * w.bandwidthRatio,
    0,
    1,
  );
}

// ---------------------------------------------------------------------------
// Time-to-Freeze Estimator
// ---------------------------------------------------------------------------

/**
 * Estimates the number of seconds until the next freeze event.
 *
 * Uses the buffer runway as the primary estimate, adjusted downward
 * when the bandwidth deficit signal is elevated.
 *
 * Returns null when confidence is insufficient.
 */
function estimateTimeToFreeze(
  metrics: VideoMetrics,
  history: MetricsSnapshot[],
  probability: number,
  confidence: PredictionConfidence,
): number | null {
  if (confidence === 'low' || probability < 0.2) {
    return null;
  }
  if (metrics.paused) {
    return null;
  }

  // Primary estimate: buffer runway.
  let runway = metrics.bufferAhead;

  // If we have drain-rate data, use it.
  if (history.length >= 3) {
    const recent = history.slice(-4);
    const drainRates: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const current = recent[i];
      const prev = recent[i - 1];
      const dtMs = current.timestamp - prev.timestamp;
      const db = prev.bufferAhead - current.bufferAhead;
      if (dtMs > 0) {
        drainRates.push(db / (dtMs / 1000));
      }
    }
    const drainRate = mean(drainRates.filter((r) => r > 0));
    if (drainRate > 0) {
      runway = metrics.bufferAhead / drainRate;
    }
  }

  // Cap at 120 s (beyond that the estimate is meaningless).
  return clamp(Math.round(runway), 0, 120);
}

// ---------------------------------------------------------------------------
// Confidence Assessment
// ---------------------------------------------------------------------------

function assessConfidence(historyLength: number): PredictionConfidence {
  if (historyLength < 5) {
    return 'low';
  }
  if (historyLength < 20) {
    return 'medium';
  }
  return 'high';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a playback freeze is likely in the near future.
 *
 * @param metrics  Current metrics snapshot from the tracker.
 * @param history  Ring-buffer of historical snapshots (oldest first).
 * @param nowMs    Wall-clock timestamp used for recency calculations.
 */
export function predictFreeze(
  metrics: VideoMetrics,
  history: MetricsSnapshot[],
  nowMs = Date.now(),
): PredictionResult {
  const confidence = assessConfidence(history.length);

  // If the video is paused or not playing, freeze risk is zero.
  if (metrics.paused || metrics.readyState < 2) {
    return {
      willFreeze: false,
      probability: 0,
      estimatedSecondsUntilFreeze: null,
      confidence,
    };
  }

  const signals = {
    bufferRunway: bufferRunwaySignal(metrics, history),
    dropTrend: dropTrendSignal(history),
    stallRecency: stallRecencySignal(metrics, nowMs),
    bandwidthRatio: bandwidthRatioSignal(metrics),
  };

  const probability = combineSignals(signals);
  const willFreeze = probability >= FREEZE_PROBABILITY_THRESHOLD;

  const estimatedSecondsUntilFreeze = willFreeze
    ? estimateTimeToFreeze(metrics, history, probability, confidence)
    : null;

  return {
    willFreeze,
    probability: Math.round(probability * 100) / 100,
    estimatedSecondsUntilFreeze,
    confidence,
  };
}

/**
 * Returns a breakdown of individual signal strengths for diagnostic display.
 * Useful in the advanced metrics panel of the popup.
 */
export function getPredictionSignals(
  metrics: VideoMetrics,
  history: MetricsSnapshot[],
  nowMs = Date.now(),
): {
  bufferRunway: number;
  dropTrend: number;
  stallRecency: number;
  bandwidthRatio: number;
  combined: number;
  confidence: PredictionConfidence;
} {
  const confidence = assessConfidence(history.length);
  const signals = {
    bufferRunway: bufferRunwaySignal(metrics, history),
    dropTrend: dropTrendSignal(history),
    stallRecency: stallRecencySignal(metrics, nowMs),
    bandwidthRatio: bandwidthRatioSignal(metrics),
  };

  return {
    ...signals,
    combined: combineSignals(signals),
    confidence,
  };
}
