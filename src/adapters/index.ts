/**
 * Video Stability Assistant – Platform Adapter Registry v2.0
 * @license Apache-2.0
 */
import type { PlatformAdapter } from '../types';
import { YouTubeAdapter } from './youtube';
import { TwitchAdapter } from './twitch';
import { NetflixAdapter } from './netflix';

const ADAPTERS: PlatformAdapter[] = [
  new YouTubeAdapter(),
  new TwitchAdapter(),
  new NetflixAdapter(),
];

class GenericAdapter implements PlatformAdapter {
  readonly name = 'generic' as const;
  detect(): boolean { return true; }
  extractDeepMetrics(): Record<string, never> { return {}; }
  getVideoElement(): HTMLVideoElement | null { return document.querySelector('video'); }
  downgradeQuality(): boolean { return false; }
}

export function getAdapter(): PlatformAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.detect()) { return adapter; }
  }
  return new GenericAdapter();
}
