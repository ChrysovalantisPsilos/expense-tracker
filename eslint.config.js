// ESLint 9 flat config. Enforces the CLAUDE.md quality bar where a linter can:
//   #2 separation of concerns — shared/ must never import from features/;
//   #7 no dead code — unused imports are errors, unused vars warn.
//
// Severity policy: `error` = must fix before merge (CI fails); `warn` = tracked
// debt that doesn't block yet. `npm run lint` fails on errors only;
// `npm run lint:strict` (--max-warnings=0) is the target once the warning
// backlog is cleared — switch the CI step to it then.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import unusedImports from 'eslint-plugin-unused-imports'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  // Edge functions are Deno/TypeScript and are checked by `supabase functions`.
  // ios/ holds Swift and the generated core bundle (mobile-core/build.mjs).
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'supabase/functions/**', '.claude/**', 'status/.wrangler/**', 'ios/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/prop-types': 'off',
      // Autofocus on the first field of a modal is intentional UX.
      'jsx-a11y/no-autofocus': 'warn',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', {
        args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
    },
  },
  // CLAUDE.md #2: shared/ must never import from features/ (wrong direction).
  {
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/features/**', '@/features/**'],
          message: 'shared/ must not import from features/ (CLAUDE.md #2).',
        }],
      }],
    },
  },
  // i18n (docs/I18N.md): no user-facing text written straight into JSX —
  // every word a person reads comes from a translation key. Symbols, the
  // brand and codes may stay literal (a URL or a code goes in a constant).
  // KitGallery.jsx is left out: it's the dev-only design-system gallery
  // (lazy-loaded behind import.meta.env.DEV, never in the production
  // build), whose sample labels are fixtures, not UI copy.
  {
    files: ['src/**/*.jsx'],
    ignores: ['src/shared/ui/kit/KitGallery.jsx'],
    rules: {
      'react/jsx-no-literals': ['error', {
        noStrings: true,
        ignoreProps: true,
        allowedStrings: ['·', '—', '–', '→', '←', '›', '©', ':', '/', '(', ')', '+', '−', '%', '…', '@', '€', 'Budgeer', 'budgeer'],
      }],
    },
  },
  { files: ['src/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  // The status page (status/): a Cloudflare Worker (service-worker style
  // globals: fetch, Response, crypto, …) plus the admin page's browser script.
  {
    files: ['status/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.serviceworker, ...globals.browser } },
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  // Plain scripts served as-is from public/ (index.html's colour-mode boot).
  { files: ['public/**/*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
  { files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.js'], languageOptions: { globals: { ...globals.node } } },
  // The mobile core (mobile-core/): the entry and codec run in JavaScriptCore
  // (engine globals only); the build and the vector recorder are Node scripts.
  {
    files: ['mobile-core/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    plugins: { 'unused-imports': unusedImports },
    rules: { 'no-unused-vars': 'off', 'unused-imports/no-unused-imports': 'error', 'unused-imports/no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none' }] },
  },
]
