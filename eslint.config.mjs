// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Default exports make renames silent and grep harder; see docs/conventions.md
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
    },
  },
  {
    // Config files at the repo root legitimately use default exports (tool contracts)
    files: ['*.config.{js,mjs,ts}', '**/*.config.{js,mjs,ts}'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
);
