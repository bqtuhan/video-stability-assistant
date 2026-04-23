/**
 * Video Stability Assistant – Freeze Prediction Engine v2.0
 * @license Apache-2.0
 */
import type {
  PredictionResult,
  VideoMetrics,
  MetricsSnapshot,
  PredictionConfidence,
} from '../types';
import { clamp, mean } from '../utils';

const FREEZE_PROBABILITY_THRESHOLD = 0.55;
const BUFFER_EXHAUSTION_CRITICAL_S = 3;
const DROP_GRADIENT_CRITICAL = 2.0;
const STALL_RECENCY_WINDOW_S = 45;
const BANDWIDTH_RATIO_CRITICAL = 1.25;

const SIGNAL_WEIGHTS = {
  bufferRunway: 0.40,
  dropTrend: 0.20,
  stallRecency: 0.25,
  bandwidthRatio: 0.15,
} as const;

function bufferRunwaySignal(metrics: VideoMetrics, history: MetricsSnapshot[]): number {
  if (metrics.paused) return 0;
  if (metrics.bufferAhead <= 0) return 1;
  let drainRate = 1.0;
  if (history.length >= 3) {
    const recent = history.slice(-5);
    const deltas: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const dtMs = recent[i].timestamp - recent[i-1].timestamp;
      const dbuffer = recent[i-1].bufferAhead - recent[i].bufferAhead;
      if (dtMs > 0) deltas.push(dbuffer / (dtMs / 1000));
    }
    if (deltas.length > 0) drainRate = Math.max(0.1, mean(deltas));
  }
  const runwayS = metrics.bufferAhead / drainRate;
  if (runwayS <= 0) return 1;
  if (runwayS >= BUFFER_EXHAUSTION_CRITICAL_S * 6) return 0;
  return clamp(Math.exp(-0.4 * (runwayS / BUFFER_EXHAUSTION_CRITICAL_S - 1)), 0, 1);
}

function dropTrendSignal(history: MetricsSnapshot[]): number {
  if (history.length < 4) return 0;
  const recent = history.slice(-8);
  const gradients: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const totalDelta = recent[i].totalFrames - recent[i-1].totalFrames;
    const dropDelta = recent[i].droppedFrames - recent[i-1].droppedFrames;
    if (totalDelta > 0) gradients.push((dropDelta / totalDelta) * 100);
  }
  if (gradients.length < 2) return 0;
  const n = gradients.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(gradients);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (gradients[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  return slope <= 0 ? 0 : clamp(slope / DROP_GRADIENT_CRITICAL, 0, 1);
}

function stallRecencySignal(metrics: VideoMetrics, nowMs: number): number {
  if (metrics.stallCount === 0 || metrics.lastStallTimestamp === 0) return 0;
  const secondsAgo = (nowMs - metrics.lastStallTimestamp) / 1000;
  if (secondsAgo >= STALL_RECENCY_WINDOW_S) return 0;
  const base = 1 - secondsAgo / STALL_RECENCY_WINDOW_S;
  const repeatFactor = Math.min(metrics.stallCount / 3, 1);
  return clamp(base + repeatFactor * 0.3, 0, 1);
}

function bandwidthRatioSignal(metrics: VideoMetrics): number {
  if (metrics.bandwidth <= 0 || metrics.bitrate <= 0) return 0;
  const ratio = metrics.bitrate / metrics.bandwidth;
  if (ratio <= 0.8) return 0;
  if (ratio >= BANDWIDTH_RATIO_CRITICAL) return 1;
  return clamp((ratio - 0.8) / (BANDWIDTH_RATIO_CRITICAL - 0.8), 0, 1);
}

export function predictFreeze(metrics: VideoMetrics, history: MetricsSnapshot[], nowMs = Date.now()): PredictionResult {
  const confidence: PredictionConfidence = history.length < 5 ? 'low' : history.length < 20 ? 'medium' : 'high';
  if (metrics.paused || metrics.readyState < 2) return { willFreeze: false, probability: 0, estimatedSecondsUntilFreeze: null, confidence };

  const signals = {
    bufferRunway: bufferRunwaySignal(metrics, history),
    dropTrend: dropTrendSignal(history),
    stallRecency: stallRecencySignal(metrics, nowMs),
    bandwidthRatio: bandwidthRatioSignal(metrics),
  };

  const probability = signals.bufferRunway * SIGNAL_WEIGHTS.bufferRunway +
                      signals.dropTrend * SIGNAL_WEIGHTS.dropTrend +
                      signals.stallRecency * SIGNAL_WEIGHTS.stallRecency +
                      signals.bandwidthRatio * SIGNAL_WEIGHTS.bandwidthRatio;

  const willFreeze = probability >= FREEZE_PROBABILITY_THRESHOLD;
  let estimatedSecondsUntilFreeze: number | null = null;
  if (willFreeze && confidence !== 'low') {
    estimatedSecondsUntilFreeze = Math.round(metrics.bufferAhead); // Simple estimate
  }

  return { willFreeze, probability: Math.round(probability * 100) / 100, estimatedSecondsUntilFreeze, confidence };
}
