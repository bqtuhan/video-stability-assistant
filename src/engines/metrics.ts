/**
 * Video Stability Assistant – VideoMetricsTracker (Metrics Engine)
 *
 * Collects, derives, and maintains a rolling history of quality signals
 * from a single HTMLVideoElement.  Stall events are detected via a
 * time-budget approach that compares expected vs actual currentTime
 * advancement, tolerating normal clock jitter.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type { VideoMetrics, MetricsSnapshot } from '../types';
import { clamp, mean, stddev } from '../utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of historical snapshots retained in the ring-buffer. */
const RING_BUFFER_SIZE = 60;

/**
 * Minimum currentTime advancement (seconds) per second of wall-clock
 * time that must occur to avoid a stall being declared.
 */
const STALL_THRESHOLD_RATIO = 0.2;

/** Minimum wall-clock interval (ms) between consecutive stall records. */
const STALL_DEBOUNCE_MS = 500;

/**
 * Rolling window (number of snapshots) used for bitrate-trend and
 * decode-time computations.
 */
const TREND_WINDOW = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StallEvent {
  startTimestamp: number;
  duration: number; // ms
}

export interface TrackerSummary {
  metrics: VideoMetrics;
  history: MetricsSnapshot[];
  recentStalls: StallEvent[];
  bitrateHistory: number[];
  decodeTimeHistory: number[];
}

// ---------------------------------------------------------------------------
// VideoMetricsTracker
// ---------------------------------------------------------------------------

export class VideoMetricsTracker {
  private readonly video: HTMLVideoElement;
  private readonly pageUrl: string;

  // — Ring-buffer history —
  private readonly history: MetricsSnapshot[] = [];

  // — Stall tracking —
  private stallCount = 0;
  private totalStallDuration = 0;
  private lastStallTimestamp = 0;
  private readonly recentStalls: StallEvent[] = [];

  // — Stall-detection state —
  private lastCheckTime = 0;
  private lastCheckPosition = 0;
  private isStalling = false;
  private stallStartTimestamp = 0;

  // — Frame counters (baseline at attach time) —
  private baseDroppedFrames = 0;
  private baseTotalFrames = 0;
  private baseDecodedFrames = 0;

  // — Bitrate estimation —
  private lastNetworkTimestamp = 0;
  private estimatedBitrate = 0;

  // — Decode time rolling window —
  private readonly decodeTimeWindow: number[] = [];

  constructor(video: HTMLVideoElement, pageUrl: string) {
    this.video = video;
    this.pageUrl = pageUrl;
    this.calibrateBaseFrames();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Takes a complete metrics snapshot from the attached video element.
   * Should be called at the configured sampling interval.
   *
   * @param nowMs  Current wall-clock time in milliseconds (defaults to Date.now()).
   */
  public snapshot(nowMs = Date.now()): VideoMetrics {
    this.detectStall(nowMs);
    this.estimateNetworkBitrate(nowMs);

    const buffers = this.computeBufferRanges();
    const frames = this.computeFrameCounts();
    const decodeTime = this.computeDecodeTime();

    const metrics: VideoMetrics = {
      timestamp: nowMs,
      url: this.pageUrl,

      bufferAhead: buffers.ahead,
      bufferBehind: buffers.behind,

      totalFrames: frames.total,
      droppedFrames: frames.dropped,
      decodedFrames: frames.decoded,

      decodeTime,

      currentTime: this.video.currentTime,
      duration: this.video.duration ?? 0,
      playbackRate: this.video.playbackRate,
      readyState: this.video.readyState,
      paused: this.video.paused,

      bitrate: this.estimatedBitrate,
      bandwidth: this.estimateBandwidth(),

      stallCount: this.stallCount,
      totalStallDuration: this.totalStallDuration,
      lastStallTimestamp: this.lastStallTimestamp,
    };

    this.pushHistory(metrics, nowMs);
    return metrics;
  }

  /**
   * Returns the ring-buffer of historical snapshots, oldest first.
   */
  public getHistory(): MetricsSnapshot[] {
    return [...this.history];
  }

  /**
   * Returns all stall events recorded since the tracker was attached,
   * newest first.
   */
  public getRecentStalls(): StallEvent[] {
    return [...this.recentStalls];
  }

  /**
   * Returns the last N bitrate samples from the history ring-buffer,
   * filtered to non-zero values.
   */
  public getBitrateHistory(count = TREND_WINDOW): number[] {
    return this.history
      .slice(-count)
      .map((s) => s.bitrate)
      .filter((b) => b > 0);
  }

  /**
   * Returns the last N decode-time samples.
   */
  public getDecodeTimeHistory(count = TREND_WINDOW): number[] {
    return this.decodeTimeWindow.slice(-count);
  }

  /**
   * Computes the rolling standard deviation of bitrate across the most
   * recent `window` snapshots.  High stddev → unstable bitrate.
   */
  public bitrateStddev(window = TREND_WINDOW): number {
    return stddev(this.getBitrateHistory(window));
  }

  /**
   * Returns the mean dropped-frame rate (%) over the most recent `window`
   * snapshot pairs.
   */
  public dropRateTrend(window = TREND_WINDOW): number {
    const recent = this.history.slice(-window);
    if (recent.length < 2) {
      return 0;
    }

    const first = recent[0];
    const last = recent[recent.length - 1];
    const totalDelta = last.totalFrames - first.totalFrames;
    const droppedDelta = last.droppedFrames - first.droppedFrames;

    if (totalDelta <= 0) {
      return 0;
    }
    return clamp((droppedDelta / totalDelta) * 100, 0, 100);
  }

  /**
   * Resets baseline frame counters.  Call when the video element is
   * reused for a new media resource (e.g. after `loadedmetadata`).
   */
  public resetBaselines(): void {
    this.calibrateBaseFrames();
    this.stallCount = 0;
    this.totalStallDuration = 0;
    this.lastStallTimestamp = 0;
    this.recentStalls.length = 0;
    this.history.length = 0;
    this.decodeTimeWindow.length = 0;
    this.estimatedBitrate = 0;
    this.lastNetworkTimestamp = 0;
    this.isStalling = false;
  }

  /**
   * Produces a full summary object (useful for serialisation and passing
   * to the advisory / prediction engines).
   */
  public getSummary(nowMs = Date.now()): TrackerSummary {
    return {
      metrics: this.snapshot(nowMs),
      history: this.getHistory(),
      recentStalls: this.getRecentStalls(),
      bitrateHistory: this.getBitrateHistory(),
      decodeTimeHistory: this.getDecodeTimeHistory(),
    };
  }

  // ---------------------------------------------------------------------------
  // Buffer Computation
  // ---------------------------------------------------------------------------

  private computeBufferRanges(): { ahead: number; behind: number } {
    const { buffered, currentTime } = this.video;
    let ahead = 0;
    let behind = 0;

    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);

      if (start <= currentTime && end >= currentTime) {
        ahead = Math.max(0, end - currentTime);
        behind = Math.max(0, currentTime - start);
        break;
      }
    }

    return { ahead, behind };
  }

  // ---------------------------------------------------------------------------
  // Frame Counter Computation
  // ---------------------------------------------------------------------------

  private calibrateBaseFrames(): void {
    const quality = this.getVideoQuality();
    if (quality) {
      this.baseDroppedFrames = quality.droppedVideoFrames;
      this.baseTotalFrames = quality.totalVideoFrames;
      this.baseDecodedFrames = quality.totalVideoFrames - quality.droppedVideoFrames;
    } else {
      this.baseDroppedFrames = 0;
      this.baseTotalFrames = 0;
      this.baseDecodedFrames = 0;
    }
  }

  private computeFrameCounts(): {
    total: number;
    dropped: number;
    decoded: number;
  } {
    const quality = this.getVideoQuality();
    if (!quality) {
      return { total: 0, dropped: 0, decoded: 0 };
    }

    return {
      total: Math.max(0, quality.totalVideoFrames - this.baseTotalFrames),
      dropped: Math.max(0, quality.droppedVideoFrames - this.baseDroppedFrames),
      decoded: Math.max(
        0,
        quality.totalVideoFrames -
          quality.droppedVideoFrames -
          this.baseDecodedFrames,
      ),
    };
  }

  private getVideoQuality(): VideoPlaybackQuality | null {
    if (typeof this.video.getVideoPlaybackQuality === 'function') {
      return this.video.getVideoPlaybackQuality();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Decode Time Estimation
  // ---------------------------------------------------------------------------

  private computeDecodeTime(): number {
    // HTMLVideoElement does not expose per-frame decode time directly.
    // We approximate it from PerformanceResourceTiming entries when available,
    // and otherwise derive a proxy from the frame-drop rate.
    try {
      const entries = performance.getEntriesByType(
        'resource',
      ) as PerformanceResourceTiming[];
      const videoEntries = entries.filter(
        (e) => e.initiatorType === 'video' || e.initiatorType === 'media',
      );
      if (videoEntries.length > 0) {
        const recent = videoEntries.slice(-5);
        const avg =
          recent.reduce((sum, e) => sum + (e.responseEnd - e.requestStart), 0) /
          recent.length;
        this.decodeTimeWindow.push(avg);
        if (this.decodeTimeWindow.length > RING_BUFFER_SIZE) {
          this.decodeTimeWindow.shift();
        }
        return avg;
      }
    } catch {
      // Fallback to empty.
    }

    return mean(this.decodeTimeWindow);
  }

  // ---------------------------------------------------------------------------
  // Stall Detection
  // ---------------------------------------------------------------------------

  private detectStall(nowMs: number): void {
    if (this.video.paused || this.video.seeking || this.video.readyState < 2) {
      this.lastCheckTime = nowMs;
      this.lastCheckPosition = this.video.currentTime;
      if (this.isStalling) {
        this.endStall(nowMs);
      }
      return;
    }

    const wallDelta = (nowMs - this.lastCheckTime) / 1000;
    const posDelta = this.video.currentTime - this.lastCheckPosition;

    // A stall is declared if playback position advances significantly slower
    // than wall-clock time (adjusted by playbackRate).
    const expectedDelta = wallDelta * this.video.playbackRate;
    const isCurrentlyStalling =
      wallDelta > 0.2 && posDelta < expectedDelta * STALL_THRESHOLD_RATIO;

    if (isCurrentlyStalling) {
      if (!this.isStalling) {
        this.startStall(nowMs);
      }
    } else if (this.isStalling) {
      this.endStall(nowMs);
    }

    this.lastCheckTime = nowMs;
    this.lastCheckPosition = this.video.currentTime;
  }

  private startStall(nowMs: number): void {
    if (nowMs - this.lastStallTimestamp < STALL_DEBOUNCE_MS) {
      return;
    }
    this.isStalling = true;
    this.stallStartTimestamp = nowMs;
    this.stallCount++;
  }

  private endStall(nowMs: number): void {
    this.isStalling = false;
    const duration = nowMs - this.stallStartTimestamp;
    if (duration > 0) {
      this.totalStallDuration += duration;
      this.lastStallTimestamp = nowMs;
      this.recentStalls.unshift({
        startTimestamp: this.stallStartTimestamp,
        duration,
      });
      if (this.recentStalls.length > 10) {
        this.recentStalls.pop();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Bitrate & Bandwidth Estimation
  // ---------------------------------------------------------------------------

  private estimateNetworkBitrate(nowMs: number): void {
    // In a real browser environment, we would use the Resource Timing API
    // or hook into the player's ABR controller. Here we provide a
    // placeholder that could be extended with actual byte-counting logic.
    const delta = (nowMs - this.lastNetworkTimestamp) / 1000;
    if (delta < 2) {
      return;
    }

    // Mock logic: bitrate is stable unless readyState is low.
    this.estimatedBitrate = this.video.readyState < 3 ? 1500 : 4500;
    this.lastNetworkTimestamp = nowMs;
  }

  private estimateBandwidth(): number {
    // Use the Network Information API if available.
    const nav = navigator as unknown as { connection?: { downlink?: number }; mozConnection?: { downlink?: number }; webkitConnection?: { downlink?: number } };
    const connection =
      nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    if (connection?.downlink) {
      return connection.downlink * 1000; // Convert Mbps to kbps
    }
    return 10000; // Default 10 Mbps
  }

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  private pushHistory(metrics: VideoMetrics, nowMs: number): void {
    const snapshot: MetricsSnapshot = {
      timestamp: nowMs,
      bufferAhead: metrics.bufferAhead,
      droppedFrames: metrics.droppedFrames,
      totalFrames: metrics.totalFrames,
      bitrate: metrics.bitrate,
      stallCount: metrics.stallCount,
      decodeTime: metrics.decodeTime,
    };

    this.history.push(snapshot);
    if (this.history.length > RING_BUFFER_SIZE) {
      this.history.shift();
    }
  }
}
