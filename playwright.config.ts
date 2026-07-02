import { defineConfig } from '@playwright/test';

// Two static-preview servers, one per build target. Each serves an already-built
// output directory (run `pnpm build:pages` / `pnpm build:single` first — the
// verification flow always does this before `pnpm e2e`).
const PAGES_PORT = 4173;
const SINGLE_PORT = 4174;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `pnpm exec vite preview --outDir dist --port ${PAGES_PORT} --strictPort`,
      port: PAGES_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite preview --outDir dist-single --port ${SINGLE_PORT} --strictPort`,
      port: SINGLE_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'pages',
      use: { baseURL: `http://localhost:${PAGES_PORT}` },
    },
    {
      name: 'single',
      use: { baseURL: `http://localhost:${SINGLE_PORT}` },
    },
  ],
});
