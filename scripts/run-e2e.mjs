#!/usr/bin/env node
// Picks two free loopback ports once and exports them as env vars before running
// Playwright. Playwright reloads playwright.config.ts independently in the main
// process and in each per-test worker process; if the config itself called a
// port-picking function, the main process and a worker process would each pick a
// *different* random port, so the webServer would bind one port while tests
// navigated to another. Fixing the ports here, once, and passing them through the
// environment keeps every process in the tree consistent.
//
// Playwright's own `webServer` config starts and stops the preview servers, so this
// wrapper never manages a child server process itself -- it only owns the ports it
// picked, and never touches any pre-existing listener (e.g. an unrelated process
// already bound to 4173).

import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const require = createRequire(import.meta.url);

function getFreePort() {
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

const [pagesPort, singlePort] = await Promise.all([getFreePort(), getFreePort()]);

// Invoke the Playwright CLI's JS entry point directly with `node`, rather than the
// platform shim in node_modules/.bin (a .cmd file on Windows), so no shell is involved.
const playwrightCliDir = dirname(require.resolve('@playwright/test/package.json'));
const playwrightCli = join(playwrightCliDir, 'cli.js');

const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    VCW_PAGES_PORT: String(pagesPort),
    VCW_SINGLE_PORT: String(singlePort),
  },
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
