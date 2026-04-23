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
  detect() { return true; }
  extractDeepMetrics() { return {}; }
  getVideoElement() { return document.querySelector('video'); }
  downgradeQuality() { return false; }
}

export function getAdapter(): PlatformAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.detect()) return adapter;
  }
  return new GenericAdapter();
}
