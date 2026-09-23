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
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'supabase/functions/**'] },
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
  { files: ['src/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['test/**/*.js', '*.config.js'], languageOptions: { globals: { ...globals.node } } },
]
