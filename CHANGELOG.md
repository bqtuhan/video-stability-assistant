# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
