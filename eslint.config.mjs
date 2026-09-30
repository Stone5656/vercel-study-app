import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'views/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'playwright.config.ts'],

    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
]);
