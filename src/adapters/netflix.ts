import type { PlatformAdapter, Platform, VideoMetrics } from '../types';
import { querySelectorAllDeep } from '../utils';

export class NetflixAdapter implements PlatformAdapter {
  readonly name: Platform = 'netflix';

  detect(): boolean {
    return window.location.hostname === 'www.netflix.com';
  }

  extractDeepMetrics(): Partial<VideoMetrics> {
    const extras: Partial<VideoMetrics> = {};
    try {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (const entry of entries) {
        if (/nflxvideo\.net|nflxext\.com|nflximg\.net/.test(entry.name)) {
          extras.cdnProvider = new URL(entry.name).hostname;
          break;
        }
      }
    } catch { /* ignore */ }

    try {
      const video = this.getVideoElement();
      if (video) {
        const mediaSource = (video as any).srcObject as MediaSource | null;
        if (mediaSource && mediaSource.sourceBuffers) {
          for (let i = 0; i < mediaSource.sourceBuffers.length; i++) {
            const type = mediaSource.sourceBuffers[i].type;
            const codecMatch = type.match(/codecs="([^"]+)"/);
            if (codecMatch) { extras.codec = codecMatch[1]; break; }
          }
        }
      }
    } catch { /* ignore */ }

    return extras;
  }

  getVideoElement(): HTMLVideoElement | null {
    const videos = querySelectorAllDeep(document, 'video') as HTMLVideoElement[];
    for (const v of videos) {
      if (v.duration > 0) return v;
    }
    return videos[0] || null;
  }

  downgradeQuality(): boolean {
    return false;
  }
}
