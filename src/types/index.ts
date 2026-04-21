/**
 * Video Stability Assistant – Type Definitions
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

// ---------------------------------------------------------------------------
// Core Stability Types
// ---------------------------------------------------------------------------

export type StabilityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export interface ScoreFactors {
  bufferHealth: number;
  dropRate: number;
  stallFrequency: number;
  bitrateStability: number;
  decodePerformance: number;
}

export interface StabilityScore {
  overall: number;
  level: StabilityLevel;
  factors: ScoreFactors;
  mode?: string;
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Metric Snapshots
// ---------------------------------------------------------------------------

export interface VideoMetrics {
  timestamp: number;
  url: string;
  duration: number;
  currentTime: number;
  paused: boolean;
  readyState: number;
  playbackRate: number;
  
  // Buffer
  bufferAhead: number;
  bufferBehind: number;
  
  // Quality (from VideoPlaybackQuality API)
  totalFrames: number;
  droppedFrames: number;
  decodedFrames: number;
  
  // Derived
  bitrate: number;
  bandwidth: number;
  decodeTime: number;
  stallCount: number;
  totalStallDuration: number;
  lastStallTimestamp: number;
}

/** Lightweight snapshot for history tracking. */
export interface MetricsSnapshot {
  timestamp: number;
  bufferAhead: number;
  droppedFrames: number;
  totalFrames: number;
  bitrate: number;
  stallCount: number;
  decodeTime: number;
}

// ---------------------------------------------------------------------------
// Settings & Configuration
// ---------------------------------------------------------------------------

export type PlaybackMode = 'balanced' | 'live' | 'vod';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type Language = 'en' | 'tr';
export type AdvisoryMode = 'simple' | 'technical';

export interface ScoringWeights {
  bufferHealth: number;
  dropRate: number;
  stallFrequency: number;
  bitrateStability: number;
  decodePerformance: number;
}

export interface ExtensionSettings {
  enabled: boolean;
  playbackMode: PlaybackMode;
  enableNotifications: boolean;
  notificationThreshold: StabilityLevel;
  enablePrediction: boolean;
  samplingIntervalMs: number;
  enabledSites: string[];
  theme: ThemeMode;
  showAdvancedMetrics: boolean;
  language: Language;
  advisoryMode: AdvisoryMode;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  playbackMode: 'balanced',
  enableNotifications: true,
  notificationThreshold: 'poor',
  enablePrediction: true,
  samplingIntervalMs: 1000,
  enabledSites: [],
  theme: 'auto',
  showAdvancedMetrics: false,
  language: 'en',
  advisoryMode: 'simple',
};

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export type MessageType =
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'RESET_SETTINGS'
  | 'SETTINGS_RESPONSE'
  | 'SETTINGS_UPDATED'
  | 'GET_TAB_STATE'
  | 'TAB_STATE_RESPONSE'
  | 'METRICS_UPDATE'
  | 'STALL_DETECTED'
  | 'NO_VIDEO_FOUND'
  | 'PING'
  | 'PONG';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  tabId?: number;
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

export type AdvisorySeverity = 'info' | 'warning' | 'critical';
export type PredictionConfidence = 'low' | 'medium' | 'high';

export interface PredictionResult {
  willFreeze: boolean;
  probability: number;
  estimatedSecondsUntilFreeze: number | null;
  confidence: PredictionConfidence;
}

export interface Advisory {
  code: string;
  title: string;
  severity: AdvisorySeverity;
  description: string;
  actions: string[];
}

export interface TabState {
  tabId: number;
  url: string;
  hostname?: string;
  lastUpdated: number;
  metrics?: VideoMetrics;
  score?: StabilityScore;
  advisories: Advisory[];
  prediction?: PredictionResult | null;
}
