/**
 * Video Stability Assistant – Twitch Platform Adapter v2.0
 * @license Apache-2.0
 */
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
        type TwitchPlayerElement = HTMLElement & {
          __twitchPlayer__?: {
            getPlaybackStats?: () => { codecs?: string; videoResolution?: string };
          };
        };
        const playerContainer = video.closest<TwitchPlayerElement>(
          '.video-player__container, .persistent-player',
        );
        const twitchPlayer = playerContainer?.__twitchPlayer__;
        if (twitchPlayer?.getPlaybackStats) {
          const stats = twitchPlayer.getPlaybackStats();
          if (stats.codecs) { extras.codec = stats.codecs; }
          if (stats.videoResolution) { extras.resolution = stats.videoResolution; }
          extras.cdnProvider = 'twitch.tv';
        }
      }
    } catch { /* ignore */ }
    return extras;
  }

  getVideoElement(): HTMLVideoElement | null {
    const videos = querySelectorAllDeep(document, 'video') as HTMLVideoElement[];
    for (const v of videos) {
      if (v.src.includes('ttvnw') || v.duration > 0) { return v; }
    }
    return videos[0] ?? null;
  }

  downgradeQuality(): boolean {
    try {
      const settingsBtn = document.querySelector<HTMLElement>(
        '[data-a-target="player-settings-button"]',
      );
      if (!settingsBtn) { return false; }
      settingsBtn.click();
      setTimeout(() => {
        const qualityBtn = document.querySelector<HTMLElement>(
          '[data-a-target="player-settings-menu-item-quality"]',
        );
        if (qualityBtn) { qualityBtn.click(); }
        setTimeout(() => {
          const options = document.querySelectorAll(
            '[data-a-target="player-settings-submenu-option"]',
          );
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
