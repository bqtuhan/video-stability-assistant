/**
 * Video Stability Assistant – ESLint Flat Configuration
 *
 * ESLint v9+ flat config format.
 * - Source files use the full TypeScript project-aware ruleset.
 * - Test files use a relaxed ruleset without project-aware type checking
 *   (test files are excluded from the main tsconfig.json to keep the
 *   production type-check fast and clean).
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */
const tsParser    = require('@typescript-eslint/parser');
const tsPlugin    = require('@typescript-eslint/eslint-plugin');
const reactPlugin = require('eslint-plugin-react');
const hooksPlugin = require('eslint-plugin-react-hooks');

// ---------------------------------------------------------------------------
// Shared rule sets
// ---------------------------------------------------------------------------

const commonRules = {
  // ── General ──────────────────────────────────────────────────────────────
  'no-console':           ['warn', { allow: ['debug', 'info', 'warn', 'error'] }],
  'no-debugger':          'error',
  'prefer-const':         'error',
  'no-var':               'error',
  'eqeqeq':              ['error', 'always'],
  'no-duplicate-imports': 'error',
  'curly':               ['error', 'all'],
};

const tsRules = {
  ...tsPlugin.configs['recommended'].rules,
  '@typescript-eslint/explicit-function-return-type':  'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any':                'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises':  'error',
  '@typescript-eslint/await-thenable':       'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
  '@typescript-eslint/prefer-nullish-coalescing':     'warn',
  '@typescript-eslint/prefer-optional-chain':         'warn',
};

const reactRules = {
  ...reactPlugin.configs['recommended'].rules,
  'react/react-in-jsx-scope':    'off',  // Not required with React 17+ JSX transform
  'react/prop-types':            'off',  // TypeScript handles prop validation
  'react/display-name':          'off',
  'react/no-unescaped-entities': 'warn',
  'react-hooks/rules-of-hooks':  'error',
  'react-hooks/exhaustive-deps': 'warn',
};

// ---------------------------------------------------------------------------
// Configuration array
// ---------------------------------------------------------------------------

module.exports = [
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: ['node_modules/**', 'dist/**', 'releases/**', '**/*.d.ts'],
  },

  // ── Production source files (project-aware type checking) ─────────────────
  {
    files: [
      'src/**/*.ts',
      'src/**/*.tsx',
    ],
    ignores: ['src/__tests__/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project:      './tsconfig.json',
        ecmaVersion:  2020,
        sourceType:   'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react':              reactPlugin,
      'react-hooks':        hooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...commonRules,
      ...tsRules,
      ...reactRules,
    },
  },

  // ── Test files (relaxed – no project-aware type checking) ─────────────────
  // Test files are excluded from tsconfig.json to keep the production
  // type-check clean. ESLint must therefore use project:false here so that
  // @typescript-eslint/parser does not attempt to resolve them via the
  // tsconfig project reference, which would cause a "file not found" error.
  {
    files: ['src/__tests__/**/*.ts', 'src/__tests__/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project:      false,
        ecmaVersion:  2020,
        sourceType:   'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...commonRules,
      // Use only non-type-aware TS rules for test files.
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/explicit-function-return-type':  'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any':                'off',  // Test fixtures legitimately use any
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Disable type-aware rules that require project resolution.
      '@typescript-eslint/no-floating-promises':          'off',
      '@typescript-eslint/no-misused-promises':           'off',
      '@typescript-eslint/await-thenable':                'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing':     'off',
      '@typescript-eslint/prefer-optional-chain':         'off',
    },
  },
];
