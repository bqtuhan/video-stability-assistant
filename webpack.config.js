/**
 * Video Stability Assistant – Webpack Configuration
 *
 * Produces a unified distribution for both Chrome MV3 and Firefox MV3.
 *
 * Build targets
 * ─────────────
 *   npm run build          → production build (Chrome manifest)
 *   npm run build:firefox  → production build (Firefox manifest)
 *   npm run dev            → development watch (Chrome manifest)
 *   npm run dev:firefox    → development watch (Firefox manifest)
 *
 * Environment variables
 * ─────────────────────
 *   BROWSER   "chrome" (default) | "firefox"
 *   NODE_ENV  "development" | "production"
 *
 * Output structure (dist/)
 * ─────────────────────────
 *   manifest.json
 *   popup.html / options.html
 *   popup.js / options.js / content.js / serviceWorker.js
 *   icons/
 *   _locales/
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

'use strict';

const path                  = require('path');
const fs                    = require('fs');
const webpack               = require('webpack');
const CopyPlugin            = require('copy-webpack-plugin');
const HtmlWebpackPlugin     = require('html-webpack-plugin');
const MiniCssExtractPlugin  = require('mini-css-extract-plugin');
const TerserPlugin          = require('terser-webpack-plugin');
const ForkTsCheckerPlugin   = require('fork-ts-checker-webpack-plugin');

// ---------------------------------------------------------------------------
// Environment Resolution
// ---------------------------------------------------------------------------

const BROWSER    = process.env.BROWSER === 'firefox' ? 'firefox' : 'chrome';
const IS_PROD    = process.env.NODE_ENV === 'production';
const IS_FIREFOX = BROWSER === 'firefox';

const ROOT    = path.resolve(__dirname);
const SRC     = path.resolve(ROOT, 'src');
const PUBLIC  = path.resolve(ROOT, 'public');
const DIST    = path.resolve(ROOT, 'dist');

// ---------------------------------------------------------------------------
// Manifest Selection
// ---------------------------------------------------------------------------

const MANIFEST_SRC = IS_FIREFOX
  ? path.resolve(ROOT, 'manifest.firefox.json')
  : path.resolve(ROOT, 'manifest.json');

// ---------------------------------------------------------------------------
// Shared Alias Map
// ---------------------------------------------------------------------------

const aliases = {
  '@':          SRC,
  '@types':     path.resolve(SRC, 'types'),
  '@utils':     path.resolve(SRC, 'utils'),
  '@engines':   path.resolve(SRC, 'engines'),
  '@components': path.resolve(SRC, 'components'),
};

// ---------------------------------------------------------------------------
// Webpack Configuration
// ---------------------------------------------------------------------------

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: IS_PROD ? 'production' : 'development',

  devtool: IS_PROD ? 'source-map' : 'inline-source-map',

  // ---------------------------------------------------------------------------
  // Entry Points
  // ---------------------------------------------------------------------------

  entry: {
    popup:         path.resolve(SRC, 'popup', 'index.tsx'),
    options:       path.resolve(SRC, 'options', 'index.tsx'),
    content:       path.resolve(SRC, 'content', 'detector.ts'),
    serviceWorker: path.resolve(SRC, 'background', 'serviceWorker.ts'),
  },

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  output: {
    path:          DIST,
    filename:      '[name].js',
    clean:         true,
    // Service workers and content scripts must not use chunk loading.
    chunkLoading:  false,
  },

  // ---------------------------------------------------------------------------
  // Module Resolution
  // ---------------------------------------------------------------------------

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias:      aliases,
  },

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  module: {
    rules: [
      // TypeScript & TSX
      {
        test:    /\.tsx?$/,
        exclude: /node_modules/,
        use:     {
          loader: 'ts-loader',
          options: {
            // Type-checking is delegated to ForkTsCheckerPlugin for speed.
            transpileOnly: true,
            compilerOptions: {
              noEmit: false,
            },
          },
        },
      },

      // CSS Modules (for any *.module.css files)
      {
        test: /\.module\.css$/,
        use:  [
          MiniCssExtractPlugin.loader,
          {
            loader:  'css-loader',
            options: { modules: true },
          },
        ],
      },

      // Global CSS
      {
        test:    /\.css$/,
        exclude: /\.module\.css$/,
        use:     [MiniCssExtractPlugin.loader, 'css-loader'],
      },

      // Static assets (icons, fonts)
      {
        test: /\.(png|jpg|jpeg|gif|svg|woff2?)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Optimisation
  // ---------------------------------------------------------------------------

  optimization: {
    minimize: IS_PROD,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false, // Preserve console.debug/info for diagnostics.
            drop_debugger: true,
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],

    // Disable runtime chunk splitting — extension scripts must be self-contained.
    runtimeChunk:   false,
    splitChunks:    false,
  },

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------

  plugins: [
    // ── Environment flags ──────────────────────────────────────────────────
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(IS_PROD ? 'production' : 'development'),
      'process.env.BROWSER':  JSON.stringify(BROWSER),
      '__IS_FIREFOX__':       JSON.stringify(IS_FIREFOX),
      '__VERSION__':          JSON.stringify(
        JSON.parse(fs.readFileSync(MANIFEST_SRC, 'utf8')).version,
      ),
    }),

    // ── TypeScript type checking (parallel) ────────────────────────────────
    new ForkTsCheckerPlugin({
      typescript: {
        configFile: path.resolve(ROOT, 'tsconfig.json'),
      },
    }),

    // ── CSS extraction ─────────────────────────────────────────────────────
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),

    // ── HTML pages (popup & options) ───────────────────────────────────────
    new HtmlWebpackPlugin({
      template: path.resolve(PUBLIC, 'popup.html'),
      filename: 'popup.html',
      chunks:   ['popup'],
      inject:   false, // We control script placement in the template.
    }),

    new HtmlWebpackPlugin({
      template: path.resolve(PUBLIC, 'options.html'),
      filename: 'options.html',
      chunks:   ['options'],
      inject:   false,
    }),

    // ── Static asset copy ──────────────────────────────────────────────────
    new CopyPlugin({
      patterns: [
        // Correct manifest (Chrome or Firefox)
        {
          from:         MANIFEST_SRC,
          to:           path.resolve(DIST, 'manifest.json'),
          transform:    (content) => {
            // In development builds, inject a distinct version suffix.
            if (!IS_PROD) {
              const manifest = JSON.parse(content.toString());
              manifest.version += '.0';  // e.g. "1.0.0.0" → stripped in prod
              return JSON.stringify(manifest, null, 2);
            }
            return content;
          },
        },

        // Icons
        {
          from: path.resolve(ROOT, 'icons'),
          to:   path.resolve(DIST, 'icons'),
          noErrorOnMissing: true,
        },

        // i18n locale files
        {
          from: path.resolve(ROOT, '_locales'),
          to:   path.resolve(DIST, '_locales'),
        },

        // HUD overlay (fetched at runtime via chrome.runtime.getURL)
        {
          from: path.resolve(PUBLIC, 'hud.html'),
          to:   path.resolve(DIST, 'hud.html'),
        },
        {
          from: path.resolve(PUBLIC, 'hud.css'),
          to:   path.resolve(DIST, 'hud.css'),
        },
      ],
    }),
  ],

  // ---------------------------------------------------------------------------
  // Performance Hints
  // ---------------------------------------------------------------------------

  performance: {
    hints:            IS_PROD ? 'warning' : false,
    // Extensions have no strict size budget, but warn above 1 MB per chunk.
    maxEntrypointSize: 1_024_000,
    maxAssetSize:      1_024_000,
  },

  // ---------------------------------------------------------------------------
  // Stats Output
  // ---------------------------------------------------------------------------

  stats: {
    assets:      true,
    chunks:      false,
    modules:     false,
    entrypoints: true,
    errors:      true,
    warnings:    true,
  },
};
