import type { PlatformAdapter, Platform, VideoMetrics } from '../types';
import { querySelectorAllDeep } from '../utils';

export class TwitchAdapter implements PlatformAdapter {
  readonly name: Platform = 'twitch';

  detect(): boolean {
    return window.location.hostname.endsWith('twitch.tv');
  }

  extractDeepMetrics(): Partial<VideoMetrics> {
    const extras: Partial<VideoMetrics> = {};
    try {
      const video = this.getVideoElement();
      if (video) {
        const playerContainer = video.closest('.video-player__container, .persistent-player');
        if (playerContainer) {
          const twitchPlayer = (playerContainer as any).__twitchPlayer__;
          if (twitchPlayer?.getPlaybackStats) {
            const stats = twitchPlayer.getPlaybackStats();
            if (stats.codecs) extras.codec = stats.codecs;
            if (stats.videoResolution) extras.resolution = stats.videoResolution;
            extras.cdnProvider = 'twitch.tv';
          }
        }
      }
    } catch { /* ignore */ }
    return extras;
  }

  getVideoElement(): HTMLVideoElement | null {
    const videos = querySelectorAllDeep(document, 'video') as HTMLVideoElement[];
    for (const v of videos) {
      if (v.src.includes('ttvnw') || v.duration > 0) return v;
    }
    return videos[0] || null;
  }

  downgradeQuality(): boolean {
    try {
      const settingsBtn = document.querySelector('[data-a-target="player-settings-button"]') as HTMLElement;
      if (!settingsBtn) return false;
      settingsBtn.click();
      setTimeout(() => {
        const qualityBtn = document.querySelector('[data-a-target="player-settings-menu-item-quality"]') as HTMLElement;
        if (qualityBtn) qualityBtn.click();
        setTimeout(() => {
          const options = document.querySelectorAll('[data-a-target="player-settings-submenu-option"]');
          if (options.length >= 2) {
            (options[1] as HTMLElement).click();
          }
        }, 100);
      }, 100);
      return true;
    } catch {
      return false;
    }
  }
}
