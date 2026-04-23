/**
 * Video Stability Assistant – Type Definitions v2.0
 * @repository github.com/bqtuhan/video-stability-assistant
 * @license Apache-2.0
 */

// ── Stability Types ──────────────────────────────────────────────
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
  mode: PlaybackMode;
  timestamp: number;
}

// ── Metric Snapshots ─────────────────────────────────────────────
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
  // Frames
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
  // Platform-specific extras (populated by adapters)
  cdnProvider?: string;
  codec?: string;
  resolution?: string;
  colorVolume?: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  bufferAhead: number;
  droppedFrames: number;
  totalFrames: number;
  bitrate: number;
  stallCount: number;
  decodeTime: number;
}

// ── Network Diagnostics ──────────────────────────────────────────
export interface NetworkDiagnostics {
  rttMs: number;
  jitterMs: number;
  packetLoss: number;
  measuredAt: number;
}

// ── Settings & Configuration ─────────────────────────────────────
export type PlaybackMode = 'balanced' | 'live' | 'vod';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type Language = 'en' | 'tr';
export type AdvisoryMode = 'simple' | 'technical';
export type Platform = 'generic' | 'youtube' | 'twitch' | 'netflix';

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
  enableHud: boolean;
  autoAction: boolean;
  autoDowngradeThreshold: number; // stability score below which auto downgrade is suggested
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
  enableHud: true,
  autoAction: false,
  autoDowngradeThreshold: 40,
};

// ── Messaging ────────────────────────────────────────────────────
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
  | 'NETWORK_DIAGNOSTICS'
  | 'AUTO_ACTION_SUGGEST'
  | 'HUD_TOGGLE'
  | 'PING'
  | 'PONG';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload?: T;
  tabId?: number;
}

// ── State Management ─────────────────────────────────────────────
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

export interface AutoAction {
  type: 'quality_downgrade_suggest' | 'pause_suggest' | 'refresh_suggest';
  reason: string;
  severity: AdvisorySeverity;
}

export interface TabState {
  tabId: number;
  url: string;
  hostname?: string;
  platform?: Platform;
  lastUpdated: number;
  metrics?: VideoMetrics;
  score?: StabilityScore;
  advisories: Advisory[];
  prediction?: PredictionResult | null;
  networkDiag?: NetworkDiagnostics;
  autoAction?: AutoAction | null;
}

// ── Logging / Export ─────────────────────────────────────────────
export interface LogEntry {
  timestamp: number;
  score: number;
  level: StabilityLevel;
  bitrate: number;
  droppedFrames: number;
  stallCount: number;
  bufferAhead: number;
  advisoryCodes: string[];
}

export type RollingLog = LogEntry[];

// ── Platform Adapter Interface ───────────────────────────────────
export interface PlatformAdapter {
  readonly name: Platform;
  /** Detect if this adapter should apply to the current page. */
  detect(): boolean;
  /** Extract platform-specific deep metrics from the page context. */
  extractDeepMetrics(): Partial<VideoMetrics>;
  /** Resolve the primary video element (may be in Shadow DOM). */
  getVideoElement(): HTMLVideoElement | null;
  /** Perform a quality downgrade action specific to this platform. */
  downgradeQuality(): boolean;
}
