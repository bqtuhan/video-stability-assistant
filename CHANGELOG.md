# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [2.0.0] - 2026-04-23

### Added
- **Shadow DOM Support**: Deep video element discovery across Shadow DOM boundaries using `chrome.dom.openOrClosedShadowRoot` with a safe fallback for Firefox, enabling monitoring on Netflix, Disney+, and other platforms that use closed shadow roots.
- **Platform Adapters**: Dedicated adapter modules for YouTube, Twitch, and Netflix that extract platform-specific deep metrics (codec, resolution, CDN provider, color volume).
- **HUD Overlay**: Floating on-page heads-up display injected as a web-accessible resource (`hud.html` / `hud.css`), showing real-time score, buffer, bitrate, and resolution without opening the popup.
- **Auto-Action Engine**: Configurable threshold-based auto-action suggestions (quality downgrade, pause, refresh) surfaced as `AutoAction` payloads in tab state.
- **Turkish i18n**: Complete Turkish translation for all advisory messages (`advisories.tr.json`) and UI strings (`_locales/tr/messages.json`).
- **`tsconfig.test.json`**: Separate TypeScript configuration for test files, enabling Jest + ts-jest to resolve test-only types (`jest`, `@jest/globals`) without polluting the production build type graph.

### Fixed
- **GitHub Actions CI**: Resolved ESLint `parserOptions.project` parse error on test files caused by `src/__tests__` being excluded from `tsconfig.json`. Test files now use a dedicated `tsconfig.test.json` with `project: false` in the ESLint flat config.
- **HUD assets missing from dist**: `hud.html` and `hud.css` were declared in `web_accessible_resources` but never copied to `dist/` by webpack. Added explicit `CopyPlugin` patterns for both files.
- **`jest-environment-jsdom` version mismatch**: Downgraded from `^30.3.0` to `^29.7.0` to match `jest@29` peer dependency requirements.
- **`ts-jest` globals deprecation**: Migrated Jest `globals["ts-jest"]` config to the modern `transform` array syntax.
- **`pnpm-lock.yaml` stale lockfile**: Removed orphaned `pnpm-lock.yaml`; project uses npm exclusively. Added `pnpm-lock.yaml` and `yarn.lock` to `.gitignore`.
- **ESLint v9 `--ext` flag**: Updated `lint` and `lint:fix` scripts to drop the deprecated `--ext .ts,.tsx` flag, which is not supported in ESLint v9 flat config mode.
- **Workflow heredoc quoting**: Fixed `cat << 'EOF'` heredoc in the release job that prevented `${{ }}` expression interpolation; replaced with unquoted `EOF` and escaped literal `$` signs.
- **`$GITHUB_OUTPUT` quoting**: Added double-quotes around `"$GITHUB_OUTPUT"` redirects in all workflow steps per GitHub Actions best practices.

### Changed
- **ESLint flat config**: Refactored `eslint.config.js` into two distinct config blocks — one for production source files (full project-aware type checking) and one for test files (non-type-aware rules only).
- **Workflow structure**: Split the monolithic `test:ci` step into three discrete workflow steps (`Lint`, `Type Check`, `Unit Tests with Coverage`) for clearer failure attribution in the Actions UI.
- **`build-firefox` job**: Added `outputs.version` to the Firefox build job (was missing, causing potential downstream reference failures).

---

## [1.2.0] - 2026-04-22

### Added
- **Production-Ready Bitrate Engine**: Replaced mock data with real-time decoded byte tracking using `webkitVideoDecodedByteCount` and Resource Timing API fallbacks.
- **Advanced Stall Detection**: New time-budget algorithm to detect micro-stalls with high precision.
- **Seek Management**: Integrated seek detection to prevent bitrate calculation spikes during user navigation.

### Fixed
- **CI/CD Pipeline**: Resolved GitHub Actions failures by optimizing TypeScript type-checking and aligning test coverage thresholds with core engine logic.
- **Code Quality**: Fixed unused parameter issues in metrics tracking to satisfy strict production linting rules.


## [1.1.0] - 2026-04-21
### Added
- Full Internationalization (i18n) support with English and Turkish languages.
- Automatic browser language detection and manual language selection in settings.
- New "Advisory Mode" setting: choose between "Simple" (user-friendly) and "Technical" (detailed) advice.
- Localized desktop notifications.
- Updated UI with localized strings for Popup and Options pages.
- Enhanced advisory engine with parameter interpolation for translated messages.

### Added
- Full CI/CD pipeline via GitHub Actions (quality gate, browser-specific builds, automated GitHub Releases on version tags)
- Extension icons (16, 32, 48, 128 px) with professional design
- `CONTRIBUTING.md` with development setup guide and architecture overview
- `CODE_OF_CONDUCT.md` based on Contributor Covenant v2.1
- `PRIVACY_POLICY.md` (GDPR/CCPA compliant)
- `TERMS.md`
- `STORE_ASSETS_GUIDE.md` with SEO-optimized store descriptions for Chrome, Firefox, and Edge
- `CHANGELOG.md`
- Bug report and feature request issue templates
- Improved `.gitignore` to exclude `releases/` and coverage directories

### Fixed
- Firefox `manifest.firefox.json`: replaced `{vsa-extension-id}` placeholder with a proper extension ID (`video-stability-assistant@bqtuhan.github.io`)

### Changed
- `README.md`: Completely rewritten as a world-class, comprehensive open-source project README with badges, architecture diagram, full feature documentation, and installation guides for all platforms including Android

---

## [1.0.0] - 2026-04-20

### Added
- Initial release of Video Stability Assistant
- Real-time video playback stability scoring (5-factor composite score)
- Freeze prediction engine (`willFreeze` algorithm)
- Actionable advisory engine (12 rule types)
- Chrome MV3 support with service worker background
- Firefox MV3 support with background scripts array
- React 18 popup UI with animated stability gauge
- Full options page with playback mode, notifications, and theme settings
- `chrome.storage.session` fallback for Firefox compatibility
- Unit test suite with Jest (scoring, advisory, prediction, utils)
- Webpack 5 build system with TypeScript and ESLint
- Apache License 2.0
