import { defineConfig } from '@playwright/test';
import { createServer } from 'node:net';

// Two static-preview servers, one per build target. Each serves an already-built
// output directory (run `pnpm build:pages` / `pnpm build:single` first — the
// verification flow always does this before `pnpm e2e`).
//
// Ports are OS-assigned ephemeral loopback ports, never hardcoded, so the suite never
// collides with an unrelated process already bound to a fixed port (e.g. 4173).
// Playwright reloads this file independently in the main process and in each per-test
// worker process, so picking a fresh random port on every load here would make the
// main process and a worker disagree on which port the server actually bound. `pnpm e2e`
// runs scripts/run-e2e.mjs, which picks the ports once and passes them via env vars so
// every process in the run agrees; the live getFreePort() calls below are only a
// convenience fallback for ad hoc direct invocations (e.g. `playwright test --list`).
function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

const PAGES_PORT = process.env.VCW_PAGES_PORT
  ? Number(process.env.VCW_PAGES_PORT)
  : await getFreePort();
const SINGLE_PORT = process.env.VCW_SINGLE_PORT
  ? Number(process.env.VCW_SINGLE_PORT)
  : await getFreePort();

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
