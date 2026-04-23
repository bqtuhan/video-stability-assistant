/**
 * Video Stability Assistant – Stability Scoring Engine v2.0
 * @license Apache-2.0
 */
import type {
  VideoMetrics,
  ScoringWeights,
  ScoreFactors,
  StabilityScore,
  PlaybackMode,
} from '../types';
import { clamp, normalise, scoreToLevel } from '../utils';

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

const BUFFER_EXCELLENT_S = 30;
const BUFFER_CRITICAL_S = 2;
const STALL_PENALTY_PER_EVENT = 20;
const BITRATE_CV_CRITICAL_PCT = 80;
const DECODE_TIME_CRITICAL_MS = 100;

function scoreBufferHealth(bufferAheadS: number): number {
  if (bufferAheadS <= 0) { return 0; }
  if (bufferAheadS < BUFFER_CRITICAL_S) { return normalise(bufferAheadS, 0, BUFFER_CRITICAL_S, 0, 30); }
  if (bufferAheadS < 10) { return normalise(bufferAheadS, BUFFER_CRITICAL_S, 10, 30, 80); }
  return normalise(bufferAheadS, 10, BUFFER_EXCELLENT_S, 80, 100);
}

function scoreDropRate(droppedFrames: number, totalFrames: number): number {
  if (totalFrames <= 0) { return 100; }
  const pct = clamp((droppedFrames / totalFrames) * 100, 0, 100);
  if (pct === 0) { return 100; }
  return clamp(100 * Math.exp(-0.14 * pct), 0, 100);
}

function scoreStallFrequency(
  stallCount: number,
  totalStallDurationMs: number,
  lastStallTimestampMs: number,
  nowMs: number,
): number {
  if (stallCount === 0) { return 100; }
  const recencyMultiplier = nowMs - lastStallTimestampMs < 60_000 ? 2 : 1;
  const countPenalty = stallCount * STALL_PENALTY_PER_EVENT * recencyMultiplier;
  const durationPenalty = Math.min(totalStallDurationMs / 1000, 30) * 2;
  return clamp(100 - countPenalty - durationPenalty, 0, 100);
}

function scoreBitrateStability(bitrateHistory: number[]): number {
  const validSamples = bitrateHistory.filter(b => b > 0);
  if (validSamples.length < 3) { return 85; }
  const meanVal = validSamples.reduce((s, v) => s + v, 0) / validSamples.length;
  if (meanVal === 0) { return 100; }
  const sd = Math.sqrt(validSamples.reduce((s, v) => s + (v - meanVal) ** 2, 0) / validSamples.length);
  const cv = (sd / meanVal) * 100;
  return clamp(normalise(cv, 0, BITRATE_CV_CRITICAL_PCT, 100, 0), 0, 100);
}

function scoreDecodePerformance(decodeTimeMs: number): number {
  if (decodeTimeMs <= 0) { return 100; }
  const nominal = 1000 / 60;
  if (decodeTimeMs <= nominal) { return 100; }
  return clamp(normalise(decodeTimeMs, nominal, DECODE_TIME_CRITICAL_MS, 100, 0), 0, 100);
}

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
    0, 100,
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
