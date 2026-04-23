/**
 * Video Stability Assistant – YouTube Platform Adapter v2.0
 * @license Apache-2.0
 */
import type { PlatformAdapter, Platform, VideoMetrics } from '../types';
import { querySelectorAllDeep } from '../utils';

interface YouTubePlayer {
  getPlaybackQuality?: () => string;
  getVideoData?: () => { video_id?: string };
}

export class YouTubeAdapter implements PlatformAdapter {
  readonly name: Platform = 'youtube';

  detect(): boolean {
    return window.location.hostname.endsWith('youtube.com');
  }

  extractDeepMetrics(): Partial<VideoMetrics> {
    const extras: Partial<VideoMetrics> = {};
    try {
      const playerEl =
        document.querySelector('#movie_player') ??
        document.querySelector('.html5-video-player');
      const player = playerEl as (HTMLElement & YouTubePlayer) | null;
      if (player) {
        if (typeof player.getPlaybackQuality === 'function') {
          extras.resolution = player.getPlaybackQuality();
        }
        if (typeof player.getVideoData === 'function') {
          const data = player.getVideoData();
          if (data?.video_id) { extras.cdnProvider = 'youtube.com'; }
        }
      }
    } catch { /* ignore */ }
    return extras;
  }

  getVideoElement(): HTMLVideoElement | null {
    const videos = querySelectorAllDeep(document, 'video') as HTMLVideoElement[];
    for (const v of videos) {
      if (v.duration > 0) { return v; }
    }
    return videos[0] ?? null;
  }

  downgradeQuality(): boolean {
    try {
      const gearBtn = document.querySelector<HTMLElement>('.ytp-settings-button');
      if (!gearBtn) { return false; }
      gearBtn.click();
      setTimeout(() => {
        const qualityItem = Array.from(document.querySelectorAll('.ytp-menuitem')).find(el =>
          (el.textContent ?? '').toLowerCase().includes('quality'),
        ) as HTMLElement | undefined;
        if (qualityItem) { qualityItem.click(); }
        setTimeout(() => {
          const options = document.querySelectorAll('.ytp-quality-menu .ytp-menuitem');
          if (options.length >= 2) {
            (options[1] as HTMLElement).click();
            gearBtn.click();
          }
        }, 100);
      }, 100);
      return true;
    } catch {
      return false;
    }
  }
}
