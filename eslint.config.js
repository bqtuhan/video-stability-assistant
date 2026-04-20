/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */

const tsParser     = require('@typescript-eslint/parser');
const tsPlugin     = require('@typescript-eslint/eslint-plugin');
const reactPlugin  = require('eslint-plugin-react');
const hooksPlugin  = require('eslint-plugin-react-hooks');

module.exports = [
  {
    files:   ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['node_modules/**', 'dist/**', '**/*.d.ts'],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project:          './tsconfig.json',
        ecmaVersion:      2020,
        sourceType:       'module',
        ecmaFeatures:     { jsx: true },
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
      // ── TypeScript ─────────────────────────────────────────────────────────
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/explicit-function-return-type':   'off',
      '@typescript-eslint/explicit-module-boundary-types':  'off',
      '@typescript-eslint/no-explicit-any':                 'error',
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
      '@typescript-eslint/await-thenable':        'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing':      'warn',
      '@typescript-eslint/prefer-optional-chain':          'warn',

      // ── React ──────────────────────────────────────────────────────────────
      ...reactPlugin.configs['recommended'].rules,
      'react/react-in-jsx-scope':   'off',  // Not required with React 17+ JSX transform
      'react/prop-types':           'off',  // TypeScript handles prop validation
      'react/display-name':         'off',
      'react/no-unescaped-entities': 'warn',

      // ── React Hooks ────────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks':  'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── General ────────────────────────────────────────────────────────────
      'no-console':         ['warn', { allow: ['debug', 'info', 'warn', 'error'] }],
      'no-debugger':        'error',
      'prefer-const':       'error',
      'no-var':             'error',
      'eqeqeq':             ['error', 'always'],
      'no-duplicate-imports': 'error',
      'curly':              ['error', 'all'],
    },
  },
];
