<div align="center">

# Video Stability Assistant

**The professional browser extension for real-time video playback quality monitoring.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![CI Status](https://github.com/bqtuhan/video-stability-assistant/actions/workflows/build.yml/badge.svg)](https://github.com/bqtuhan/video-stability-assistant/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**Never guess why your video is buffering again.**

[Install for Chrome](#installation) · [Install for Firefox](#installation) · [Report a Bug](https://github.com/bqtuhan/video-stability-assistant/issues/new?template=bug_report.yml) · [Request a Feature](https://github.com/bqtuhan/video-stability-assistant/issues/new?template=feature_request.yml)

</div>

---

## What is Video Stability Assistant?

Video Stability Assistant is a production-grade browser extension that monitors HTML5 video playback quality in real time. It computes a multi-factor stability score, predicts freeze events before they occur, and delivers actionable advisory recommendations — all without any simulation or placeholder data, and without sending a single byte of your data to external servers.

It is built for live stream viewers, remote workers, educators, and anyone who relies on stable video playback. If you have ever sat through a buffering video wondering whether to refresh the page, lower the quality, or check your network, this extension answers those questions for you automatically.

---

## Features

**Stability Scoring** — A five-factor weighted composite score (0–100) computed continuously across three selectable playback modes: Balanced, Live, and VOD. Each mode applies calibrated weights that reflect the quality priorities of its playback context.

**Freeze Prediction** — A multi-signal `willFreeze` algorithm that combines buffer runway, drop-rate trend, stall recency, and bandwidth deficit signals into a probability estimate with a time-to-freeze projection.

**Actionable Advisories** — A prioritised rule engine that maps metric conditions to human-readable advisory cards, each with severity classification and ordered remediation steps.

**Dual-Browser Support** — A single TypeScript codebase produces correct Manifest V3 bundles for both Chrome (service worker) and Firefox (background scripts array), with automatic runtime fallbacks for `chrome.storage.session`.

**Android Browser Support** — The Chrome build is fully compatible with Kiwi Browser and Yandex Browser on Android, enabling mobile video monitoring with touch-optimized controls.

**Dark Mode & i18n** — Full light/dark/system theme support and a complete `_locales/en/messages.json` internationalisation structure ready for extension to additional locales.

**Privacy First** — All analysis is performed locally. No data is collected, stored, or transmitted to any external server.

---

## Architecture

The codebase follows a strict layered architecture with no circular dependencies between layers.

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                       │
│  src/popup/PopupApp.tsx   src/options/OptionsApp │
│  src/components/  (StabilityGauge, BufferBar…)   │
└─────────────────────────┬───────────────────────┘
                          │ chrome.runtime.sendMessage
┌─────────────────────────▼───────────────────────┐
│             Background Service Worker            │
│  src/background/serviceWorker.ts                 │
│  • Per-tab state management                      │
│  • Settings persistence (chrome.storage.sync)    │
│  • Notification dispatch                         │
│  • Badge updates                                 │
└──────┬──────────────────┬───────────────────────┘
       │ METRICS_UPDATE   │ TAB_STATE_RESPONSE
┌──────▼──────────┐  ┌────▼─────────────────────┐
│  Content Layer  │  │       Engine Layer         │
│  detector.ts    │  │  scoring.ts  (5-factor)    │
│  observer.ts    │  │  advisory.ts (rule engine) │
│  (MutationObs)  │  │  prediction.ts (willFreeze)│
└──────┬──────────┘  │  metrics.ts  (tracker)     │
       │             └────────────────────────────┘
┌──────▼──────────────────────────────────────────┐
│             Shared Foundation Layer              │
│  src/types/index.ts    (all interfaces & enums)  │
│  src/utils/index.ts    (pure utility functions)  │
└─────────────────────────────────────────────────┘
```

All inter-layer communication uses the typed `ExtensionMessage` discriminated union defined in `src/types/index.ts`, ensuring compile-time safety across all message boundaries.

---

## Scoring Engine

**File:** `src/engines/scoring.ts`

The scoring engine computes a composite stability score from five orthogonal quality signals, each normalised independently to [0, 100] before weighted combination.

| Factor | Measurement | Normalisation Approach |
|---|---|---|
| `bufferHealth` | Seconds of buffer ahead | Non-linear, 3-zone curve (0–2s critical, 2–10s warning, 10–30s healthy) |
| `dropRate` | Dropped / total frames % | Exponential decay: `100 × e^(−0.14 × pct)` |
| `stallFrequency` | Stall count + duration | Linear penalty with 2× recency multiplier for stalls within 60s |
| `bitrateStability` | Coefficient of variation (σ/μ) | Linear normalisation of CV from 0–80% |
| `decodePerformance` | Average decode time per frame | Linear from nominal (16.67ms = 100) to critical (100ms = 0) |

### Mode Weight Presets

All weights are verified to sum to 1.0 by the `validateWeights()` function.

| Factor | Balanced | Live | VOD |
|---|---|---|---|
| Buffer Health | 0.25 | **0.30** | 0.20 |
| Drop Rate | 0.20 | 0.15 | **0.25** |
| Stall Frequency | 0.25 | **0.30** | 0.20 |
| Bitrate Stability | 0.15 | 0.10 | **0.20** |
| Decode Performance | 0.15 | 0.15 | 0.15 |

**Balanced** is the general-purpose default. **Live** elevates buffer health and stall suppression because live streams have no re-buffering headroom. **VOD** increases the penalty for drop rate and bitrate instability since long-form content viewers are more sensitive to sustained visual quality degradation.

### Stability Level Thresholds

| Score Range | Level |
|---|---|
| 85–100 | Excellent |
| 65–84 | Good |
| 45–64 | Fair |
| 25–44 | Poor |
| 0–24 | Critical |

---

## Freeze Prediction Engine

**File:** `src/engines/prediction.ts`

The `predictFreeze()` function implements the `willFreeze` algorithm, enhanced with a multi-signal confidence model.

**Buffer Runway (weight: 0.40)** models the time until buffer exhaustion by computing the drain rate from recent history and mapping the estimated runway to a probability via exponential decay.

**Drop Rate Trend (weight: 0.20)** computes the linear regression slope of the per-snapshot drop-rate gradient. A positive slope (accelerating frame loss) maps to higher probability.

**Stall Recency (weight: 0.25)** applies linear decay from 1.0 (stall just occurred) to 0 (stall older than 45s), amplified by up to 0.3 for repeated stalls.

**Bandwidth Ratio (weight: 0.15)** maps the `bitrate / bandwidth` ratio to [0,1] between the comfortable headroom threshold (0.8) and the critical deficit threshold (1.25).

Confidence is assigned based on history depth: `low` (< 5 snapshots), `medium` (5–19 snapshots), `high` (20+ snapshots).

---

## Advisory Engine

**File:** `src/engines/advisory.ts`

The advisory engine evaluates a prioritised set of rules against the current metrics and score. Rules are pure functions with no side effects. A maximum of five advisories are returned per evaluation pass, ordered by rule priority.

| Code | Severity | Trigger Condition |
|---|---|---|
| `BUFFER_CRITICAL` | critical | Buffer ahead < 2s and not paused |
| `LOW_READYSTATE` | warning | readyState < 3 while playing |
| `STALL_RECENT` | critical | Stall within last 30s |
| `BANDWIDTH_DEFICIT` | critical | Bitrate exceeds bandwidth by > 500 kbps |
| `DROP_RATE_HIGH` | warning | Drop rate ≥ 5% |
| `BUFFER_LOW` | warning | Buffer ahead 2–8s |
| `BITRATE_UNSTABLE` | warning | bitrateStability factor < 40 |
| `DECODE_SLOW` | warning | Average decode time > 50ms |
| `STALL_RECURRING` | warning | ≥ 3 stalls within last 5 minutes |
| `HIGH_PLAYBACK_RATE` | info | Playback rate > 1.5× |
| `LIVE_BUFFER_LARGE` | info | Live mode and buffer > 20s |
| `SCORE_GOOD` | info | Overall score ≥ 85 |

---

## Cross-Browser Compatibility

| Feature | Chrome / Edge / Brave | Firefox | Kiwi (Android) |
|---|---|---|---|
| Manifest V3 | ✅ | ✅ (109+) | ✅ |
| Service Worker | ✅ | ✅ (scripts array) | ✅ |
| `chrome.storage.session` | ✅ | Fallback to `local` | ✅ |
| `chrome.action` | ✅ | ✅ | ✅ |
| Desktop Notifications | ✅ | ✅ | ✅ |

Two manifests are maintained: `manifest.json` (Chrome MV3) and `manifest.firefox.json` (Firefox MV3). Browser-specific divergences are handled transparently via utility functions in `src/utils/index.ts`.

---

## Installation

### From GitHub Releases (Recommended)

1. Go to the [Releases page](https://github.com/bqtuhan/video-stability-assistant/releases).
2. Download the `.zip` file for your browser (`-chrome.zip` or `-firefox.zip`).
3. Follow the browser-specific instructions below.

### Chrome / Edge / Brave
1. Extract the downloaded `.zip` file.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer Mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extracted folder.

### Firefox
1. Open `about:debugging` → **This Firefox**.
2. Click **Load Temporary Add-on**.
3. Select the downloaded `-firefox.zip` file directly.

### Android (Kiwi Browser)
1. Download the `-chrome.zip` file to your Android device.
2. Extract it using a file manager.
3. Open Kiwi Browser → Menu (⋮) → **Extensions**.
4. Enable **Developer Mode**.
5. Click **Load unpacked (from .zip)** and select the extracted folder.

---

## Development

### Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/bqtuhan/video-stability-assistant.git
cd video-stability-assistant

# Install dependencies
npm install

# Build for Chrome (production)
npm run build

# Build for Firefox (production)
npm run build:firefox

# Start the webpack watcher (Chrome)
npm run dev

# Start the webpack watcher (Firefox)
npm run dev:firefox
```

### Directory Structure

```
video-stability-assistant/
├── .github/
│   ├── workflows/build.yml          # CI/CD pipeline
│   └── ISSUE_TEMPLATE/              # Bug & feature request templates
├── _locales/en/messages.json        # i18n string table
├── icons/                           # Extension icons (16, 32, 48, 128 px)
├── public/
│   ├── popup.html                   # Popup entry HTML
│   └── options.html                 # Options page entry HTML
├── scripts/
│   └── zip.js                       # Distribution packaging script
├── src/
│   ├── types/index.ts               # All shared interfaces and enums
│   ├── utils/index.ts               # Pure utility functions
│   ├── engines/
│   │   ├── metrics.ts               # VideoMetricsTracker class
│   │   ├── scoring.ts               # 5-factor scoring engine
│   │   ├── advisory.ts              # Rule-based advisory engine
│   │   └── prediction.ts            # Freeze prediction engine
│   ├── content/
│   │   ├── detector.ts              # Content script entry point
│   │   └── observer.ts              # VideoObserver (MutationObserver)
│   ├── background/
│   │   └── serviceWorker.ts         # Background service worker
│   ├── popup/
│   │   ├── index.tsx                # Popup React entry point
│   │   └── PopupApp.tsx             # Popup application component
│   ├── options/
│   │   ├── index.tsx                # Options React entry point
│   │   └── OptionsApp.tsx           # Options application component
│   ├── components/
│   │   ├── StabilityGauge.tsx       # Animated SVG arc gauge
│   │   ├── MetricComponents.tsx     # BufferBar, MetricCard, AdvisoryPanel
│   │   ├── FactorBreakdown.tsx      # 5-factor score visualisation
│   │   └── PredictionBanner.tsx     # Freeze prediction banner
│   └── __tests__/
│       ├── setup.ts                 # Jest environment stubs
│       ├── scoring.test.ts
│       ├── advisory.test.ts
│       ├── prediction.test.ts
│       └── utils.test.ts
├── manifest.json                    # Chrome MV3 manifest
├── manifest.firefox.json            # Firefox MV3 manifest
├── webpack.config.js                # Build configuration
├── tsconfig.json                    # TypeScript configuration
├── eslint.config.js                 # ESLint flat configuration
└── package.json
```

---

## Build System

The webpack configuration (`webpack.config.js`) produces four self-contained entry-point bundles with no runtime chunk splitting, which is a requirement for browser extension scripts.

| Entry | Output | Purpose |
|---|---|---|
| `src/popup/index.tsx` | `popup.js` | Popup UI |
| `src/options/index.tsx` | `options.js` | Options page UI |
| `src/content/detector.ts` | `content.js` | Injected content script |
| `src/background/serviceWorker.ts` | `serviceWorker.js` | Background worker |

The `BROWSER` environment variable selects the correct manifest and enables Firefox-specific code paths.

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode
npm run test:watch
```

The test suite covers the three engine modules and all utility functions with boundary conditions, mode differentiation, invariant verification, and edge-case handling. Coverage thresholds are enforced at 70% branches, 75% lines and functions.

---

## Configuration Reference

All settings are persisted via `chrome.storage.sync` and are therefore shared across a user's signed-in browser profiles.

| Setting | Type | Default | Description |
|---|---|---|---|
| `playbackMode` | `'balanced' \| 'live' \| 'vod'` | `'balanced'` | Scoring weight preset. |
| `enableNotifications` | `boolean` | `true` | Whether desktop notifications are dispatched. |
| `notificationThreshold` | `StabilityLevel` | `'poor'` | Minimum level that triggers a notification. |
| `enablePrediction` | `boolean` | `true` | Enables the freeze prediction engine. |
| `samplingIntervalMs` | `number` | `1000` | Metrics collection interval (500–5000 ms). |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | UI colour theme. |
| `showAdvancedMetrics` | `boolean` | `false` | Shows additional metrics in the popup. |
| `enabledSites` | `string[]` | `[]` | Hostname allowlist (empty = all sites). |

---

## Contributing

We welcome contributions of all kinds! Please read our [Contributing Guide](./CONTRIBUTING.md) to get started. By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

When adding a new advisory rule, include a corresponding test case in `src/__tests__/advisory.test.ts` that verifies both the trigger condition and its negation.

When modifying weight presets in `scoring.ts`, run `npm run validate-weights` to confirm that all three presets still sum to 1.0.

---

## License

Copyright 2026 bqtuhan

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for the full text.

---

## Legal

- [Privacy Policy](./PRIVACY_POLICY.md)
- [Terms of Service](./TERMS.md)
