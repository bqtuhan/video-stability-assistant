import type { PlatformAdapter, Platform, VideoMetrics } from '../types';
import { querySelectorAllDeep } from '../utils';

export class YouTubeAdapter implements PlatformAdapter {
  readonly name: Platform = 'youtube';

  detect(): boolean {
    return window.location.hostname.endsWith('youtube.com');
  }

  extractDeepMetrics(): Partial<VideoMetrics> {
    const extras: Partial<VideoMetrics> = {};
    try {
      const player = (document.querySelector('#movie_player') as any) || 
                     (document.querySelector('.html5-video-player') as any);
      
      if (player) {
        if (typeof player.getPlaybackQuality === 'function') {
          extras.resolution = player.getPlaybackQuality();
        }
        if (typeof player.getVideoData === 'function') {
          const data = player.getVideoData();
          if (data && data.video_id) extras.cdnProvider = 'youtube.com';
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
    try {
      const gearBtn = document.querySelector('.ytp-settings-button') as HTMLElement;
      if (!gearBtn) return false;
      gearBtn.click();

      setTimeout(() => {
        const qualityItem = Array.from(document.querySelectorAll('.ytp-menuitem')).find(el =>
          (el.textContent ?? '').toLowerCase().includes('quality'),
        ) as HTMLElement | undefined;
        if (qualityItem) qualityItem.click();

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
