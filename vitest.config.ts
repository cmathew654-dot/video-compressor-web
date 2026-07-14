import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-single/**',
      'test-results/**',
      'playwright-report/**',
      'tests/fixtures/**',
      'tests/e2e.spec.ts',
    ],
  },
});
