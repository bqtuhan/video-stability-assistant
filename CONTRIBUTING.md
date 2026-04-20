# Contributing to Video Stability Assistant

First off, thank you for considering contributing to Video Stability Assistant! It's people like you that make the open-source community such a great place to learn, inspire, and create.

The goal of this project is to build the most robust, cross-browser, and transparent video stability monitoring tool available. We welcome contributions ranging from bug reports and documentation improvements to new scoring factors and performance optimizations.

## Code of Conduct

By participating in this project, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). We expect all contributors to maintain a respectful and welcoming environment.

## How Can I Contribute?

### 1. Reporting Bugs
If you find a bug, please check the [issue tracker](https://github.com/bqtuhan/video-stability-assistant/issues) first to see if it has already been reported. If not, open a new issue using the **Bug Report** template. Be sure to include your browser version, extension version, and steps to reproduce the issue.

### 2. Suggesting Enhancements
Have an idea to make the extension better? We'd love to hear it! Open an issue using the **Feature Request** template. Provide as much detail as possible about why the feature is needed and how you envision it working.

### 3. Submitting Pull Requests
If you want to contribute code, follow these steps:

1. **Fork the repository** and create your branch from `main`.
2. **Install dependencies:** `npm install`
3. **Make your changes.** Keep your commits atomic and well-described.
4. **Ensure cross-browser compatibility.** This extension supports both Chrome and Firefox (Manifest V3). If you use a browser-specific API, ensure there is a fallback or check (e.g., `hasSessionStorage()` in `src/utils/index.ts`).
5. **Write or update tests.** If you add a new advisory rule, add a test in `src/__tests__/advisory.test.ts`. If you modify scoring weights, run `npm run validate-weights`.
6. **Run the quality gate locally:**
   - `npm run type-check`
   - `npm run lint`
   - `npm test`
7. **Submit the PR.** Describe your changes thoroughly in the PR description. Link any relevant issues.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/video-stability-assistant.git
cd video-stability-assistant

# Install dependencies
npm install

# Start development watcher for Chrome
npm run dev

# Start development watcher for Firefox
npm run dev:firefox
```

### Architecture Overview

Before making structural changes, please review the Architecture section in the `README.md`. The project follows a strict layered approach:
- **UI Layer** (`src/popup`, `src/options`)
- **Background Layer** (`src/background`)
- **Content Layer** (`src/content`)
- **Engine Layer** (`src/engines`)
- **Shared Foundation** (`src/types`, `src/utils`)

Communication between layers MUST use the typed `ExtensionMessage` protocol.

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache License 2.0](./LICENSE).
