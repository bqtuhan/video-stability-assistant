/**
 * Video Stability Assistant – DOM Video Observer
 *
 * Manages a set of active video elements discovered on the page.
 * Uses a MutationObserver to respond to DOM changes and a
 * ResizeObserver to track viewport presence, in addition to a
 * periodic snapshot interval for metrics collection.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import { VideoMetricsTracker } from '../engines/metrics';
import { throttle } from '../utils';
import type { VideoMetrics, ExtensionMessage } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ObserverOptions {
  /** Metrics collection interval in milliseconds (default: 1000). */
  samplingIntervalMs?: number;
  /** Minimum interval between consecutive message sends (default: 800). */
  messageThrottleMs?: number;
  /** Callback invoked whenever metrics are collected. */
  onMetrics?: (metrics: VideoMetrics) => void;
  /** Callback invoked when a stall event is detected. */
  onStall?: (duration: number, timestamp: number) => void;
}

interface TrackedVideo {
  element: HTMLVideoElement;
  tracker: VideoMetricsTracker;
  /** Whether the video is currently visible in the viewport. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// VideoObserver
// ---------------------------------------------------------------------------

export class VideoObserver {
  private readonly tracked = new Map<HTMLVideoElement, TrackedVideo>();

  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private samplingTimer: ReturnType<typeof setInterval> | null = null;

  private readonly samplingIntervalMs: number;
  private readonly sendMetrics: (metrics: VideoMetrics) => void;
  private readonly onStall: ((duration: number, timestamp: number) => void) | undefined;

  /** The primary video element – the largest visible one on the page. */
  private primaryVideo: HTMLVideoElement | null = null;

  constructor(options: ObserverOptions = {}) {
    this.samplingIntervalMs = options.samplingIntervalMs ?? 1000;
    this.onStall = options.onStall;

    const throttleMs = options.messageThrottleMs ?? 800;

    // Throttle the actual message send so rapid DOM events cannot flood
    // the service worker.
    const rawSend = (metrics: VideoMetrics) => {
      options.onMetrics?.(metrics);

      const message: ExtensionMessage = {
        type: 'METRICS_UPDATE',
        payload: metrics,
      };

      chrome.runtime.sendMessage(message).catch(() => {
        // Service worker may be inactive; this is safe to ignore.
      });
    };

    this.sendMetrics = throttle(rawSend as (...args: unknown[]) => void, throttleMs) as (
      m: VideoMetrics,
    ) => void;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Attaches all observers and begins metrics collection.
   * Safe to call multiple times (idempotent if already attached).
   */
  public attach(): void {
    if (this.mutationObserver !== null) {
      return; // Already attached.
    }

    this.scanForVideos();

    this.mutationObserver = new MutationObserver(
      throttle(this.handleMutation.bind(this) as (...args: unknown[]) => void, 300) as MutationCallback,
    );

    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));

    this.samplingTimer = setInterval(
      this.collectMetrics.bind(this),
      this.samplingIntervalMs,
    );
  }

  /**
   * Removes all observers, clears the sampling timer, and releases all
   * tracked video references.
   */
  public detach(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.samplingTimer !== null) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }

    this.tracked.clear();
    this.primaryVideo = null;
  }

  /**
   * Returns the currently tracked primary (largest visible) video element,
   * or null if none is present.
   */
  public getPrimaryVideo(): HTMLVideoElement | null {
    return this.primaryVideo;
  }

  /**
   * Returns the metrics tracker for the primary video, or null.
   */
  public getPrimaryTracker(): VideoMetricsTracker | null {
    if (!this.primaryVideo) {
      return null;
    }
    return this.tracked.get(this.primaryVideo)?.tracker ?? null;
  }

  /**
   * Returns the number of video elements currently being tracked.
   */
  public getTrackedCount(): number {
    return this.tracked.size;
  }

  // ---------------------------------------------------------------------------
  // Video Discovery
  // ---------------------------------------------------------------------------

  private scanForVideos(): void {
    const videos = document.querySelectorAll<HTMLVideoElement>('video');
    videos.forEach((v) => this.trackVideo(v));
    this.electPrimary();
  }

  private trackVideo(video: HTMLVideoElement): void {
    if (this.tracked.has(video)) {
      return;
    }

    const tracker = new VideoMetricsTracker(video, window.location.href);

    const entry: TrackedVideo = {
      element: video,
      tracker,
      visible: this.isVisible(video),
    };

    this.tracked.set(video, entry);
    this.resizeObserver?.observe(video);
    this.attachVideoEvents(video, tracker);
  }

  private untrackVideo(video: HTMLVideoElement): void {
    if (!this.tracked.has(video)) {
      return;
    }
    this.resizeObserver?.unobserve(video);
    this.tracked.delete(video);

    if (this.primaryVideo === video) {
      this.electPrimary();
    }
  }

  /**
   * Elects the primary video as the largest visible element.
   * Falls back to the largest element overall if none are visible.
   */
  private electPrimary(): void {
    let best: HTMLVideoElement | null = null;
    let bestArea = -1;

    for (const [video, entry] of this.tracked) {
      if (!entry.visible) {
        continue;
      }
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = video;
      }
    }

    // Fallback: pick any tracked video if none are visible.
    if (!best && this.tracked.size > 0) {
      best = [...this.tracked.keys()][0] || null;
    }

    this.primaryVideo = best;
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  private handleMutation(mutations: MutationRecord[]): void {
    let changed = false;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLVideoElement) {
          this.trackVideo(node);
          changed = true;
        } else if (node instanceof Element) {
          node.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
            this.trackVideo(v);
            changed = true;
          });
        }
      }

      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLVideoElement) {
          this.untrackVideo(node);
          changed = true;
        } else if (node instanceof Element) {
          node.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
            this.untrackVideo(v);
            changed = true;
          });
        }
      }
    }

    if (changed) {
      this.electPrimary();
    }
  }

  private handleResize(entries: ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const video = entry.target as HTMLVideoElement;
      const tracked = this.tracked.get(video);
      if (tracked) {
        tracked.visible = this.isVisible(video);
      }
    }
    this.electPrimary();
  }

  private attachVideoEvents(
    video: HTMLVideoElement,
    tracker: VideoMetricsTracker,
  ): void {
    const onLoadedMetadata = () => tracker.resetBaselines();
    const onStall = () => {
      // Emit stall event; duration will be available in the next snapshot.
      const lastStall = tracker.getRecentStalls()[0];
      if (lastStall && this.onStall) {
        this.onStall(lastStall.duration, lastStall.startTimestamp);
        const msg: ExtensionMessage = {
          type: 'STALL_DETECTED',
          payload: { duration: lastStall.duration, timestamp: lastStall.startTimestamp },
        };
        chrome.runtime.sendMessage(msg).catch(() => {});
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onStall);

    // Clean up when the element is garbage-collected (best effort).
    // In practice the MutationObserver removal handler calls untrackVideo.
  }

  // ---------------------------------------------------------------------------
  // Metrics Collection
  // ---------------------------------------------------------------------------

  private collectMetrics(): void {
    if (!this.primaryVideo) {
      chrome.runtime.sendMessage({ type: 'NO_VIDEO_FOUND' } as ExtensionMessage).catch(
        () => {},
      );
      return;
    }

    const tracked = this.tracked.get(this.primaryVideo);
    if (!tracked) {
      return;
    }

    const metrics = tracked.tracker.snapshot();
    this.sendMetrics(metrics);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isVisible(element: HTMLVideoElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }
}
