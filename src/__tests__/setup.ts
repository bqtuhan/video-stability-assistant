import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Chrome Extension API Stubs
// ---------------------------------------------------------------------------

const mockStorage: Record<string, any> = {};

const createStorageArea = () => ({
  get: jest.fn(async (key: any) => {
    if (typeof key === 'string') return { [key]: mockStorage[key] };
    if (Array.isArray(key)) {
      const res: any = {};
      key.forEach(k => res[k] = mockStorage[k]);
      return res;
    }
    return { ...key, ...mockStorage };
  }),
  set: jest.fn(async (items: Record<string, unknown>) => {
    Object.assign(mockStorage, items);
  }),
  remove: jest.fn(async (key: string) => {
    delete mockStorage[key];
  }),
  clear: jest.fn(async () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }),
});

(global as any).chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: jest.fn(async () => ({})),
    onMessage: {
      addListener:    jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: { addListener: jest.fn() },
    onConnect:   { addListener: jest.fn() },
    getManifest: jest.fn(() => ({ version: '2.0.0' })),
    getURL:      jest.fn((path: string) => `chrome-extension://test-id/${path}`),
    openOptionsPage: jest.fn(),
  },

  storage: {
    sync:    createStorageArea(),
    local:   createStorageArea(),
    session: createStorageArea(),
  },

  action: {
    setBadgeText:            jest.fn(async () => {}),
    setBadgeBackgroundColor: jest.fn(async () => {}),
    setTitle:                jest.fn(async () => {}),
  },

  tabs: {
    query:       jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    onRemoved:   { addListener: jest.fn() },
    onUpdated:   { addListener: jest.fn() },
  },

  notifications: {
    create: jest.fn(async () => 'notif-id'),
  },

  i18n: {
    getMessage: jest.fn((key: string) => key),
  },

  dom: {
    openOrClosedShadowRoot: jest.fn((el: any) => el.shadowRoot),
  }
};

// ---------------------------------------------------------------------------
// DOM Stubs
// ---------------------------------------------------------------------------

Object.defineProperty(HTMLVideoElement.prototype, 'getVideoPlaybackQuality', {
  value: jest.fn(() => ({
    totalVideoFrames:   1000,
    droppedVideoFrames: 10,
    corruptedVideoFrames: 0,
    creationTime:       performance.now(),
    totalFrameDelay:    0,
  })),
  writable: true,
});

class MockTimeRanges {
  private readonly _ranges: [number, number][];
  constructor(ranges: [number, number][] = []) {
    this._ranges = ranges;
  }
  get length() { return this._ranges.length; }
  start(i: number) { return this._ranges[i]?.[0] ?? 0; }
  end(i: number)   { return this._ranges[i]?.[1] ?? 0; }
}

Object.defineProperty(HTMLVideoElement.prototype, 'buffered', {
  get() {
    return new MockTimeRanges([[0, (this as HTMLVideoElement).currentTime + 15]]);
  },
  configurable: true,
});

Object.defineProperty(navigator, 'connection', {
  value: { downlink: 10 },
  writable: true,
  configurable: true,
});
