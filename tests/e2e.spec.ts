import { test, expect, type Page, type Locator } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const FIXTURE_PATH = join(__dirname, 'fixtures', 'fixture.mp4');
const FFMPEG_PATH = 'C:\\Users\\Cyril\\Projects\\video-compressor\\ffmpeg.exe';
const SCREENS_DIR = join(ROOT_DIR, 'test-results', 'screens');

function validateDecodable(filePath: string): { code: number | null; stderr: string } {
  const result = spawnSync(FFMPEG_PATH, ['-v', 'error', '-i', filePath, '-f', 'null', '-'], {
    encoding: 'utf-8',
  });
  return { code: result.status, stderr: (result.stderr ?? '').trim() };
}

/** Uploads the fixture and waits for the row to reach the "ready" state. */
async function uploadFixtureAndWaitReady(page: Page): Promise<Locator> {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(FIXTURE_PATH);
  const row = page.locator('tbody tr').first();
  await expect(row.locator('td').last()).toContainText('Ready', { timeout: 30_000 });
  return row;
}

test.describe('video compressor e2e', () => {
  test('conversion round-trip produces a smaller, decodable file', async ({ page }) => {
    const consoleLines: string[] = [];
    page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`));

    const fixtureSize = statSync(FIXTURE_PATH).size;
    const row = await uploadFixtureAndWaitReady(page);

    // "Est. out" is the 3rd column and must show a computed size, not the empty dash.
    await expect(row.locator('td').nth(2)).not.toHaveText('—');

    const startBtn = page.locator('#start');
    await expect(startBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent('download', { timeout: 100_000 });
    await startBtn.click();
    const download = await downloadPromise;

    const outDir = mkdtempSync(join(tmpdir(), 'vcw-e2e-'));
    const outPath = join(outDir, download.suggestedFilename() || 'out.mp4');
    await download.saveAs(outPath);

    const outSize = statSync(outPath).size;

    if (outSize === 0) {
      console.log('Page console/errors:\n' + consoleLines.join('\n'));
    }
    expect(outSize).toBeGreaterThan(0);
    expect(outSize).toBeLessThan(fixtureSize);

    const { code, stderr } = validateDecodable(outPath);
    if (code !== 0 || stderr !== '') {
      console.log(`ffmpeg validation failed (exit ${code}): ${stderr}`);
      console.log('Page console/errors:\n' + consoleLines.join('\n'));
    }
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  test('no request leaves the origin and CSP blocks the network', async ({ page, baseURL }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const reqOrigin = new URL(req.url()).origin;
      const pageOrigin = new URL(baseURL!).origin;
      if (reqOrigin !== pageOrigin) externalRequests.push(req.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(externalRequests).toEqual([]);

    const cspContent = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(cspContent).toBeTruthy();
    expect(cspContent).toContain("connect-src 'none'");
  });

  test('queue row and batch bar reflect a completed conversion', async ({ page }) => {
    const row = await uploadFixtureAndWaitReady(page);

    const batchPanel = page.locator('.vc-batch');
    await expect(batchPanel).toBeHidden();

    const downloadPromise = page.waitForEvent('download', { timeout: 100_000 });
    await page.locator('#start').click();

    await expect(batchPanel).toBeVisible({ timeout: 10_000 });

    await downloadPromise;

    await expect(batchPanel).toBeHidden({ timeout: 15_000 });

    const statusCell = row.locator('td').last();
    await expect(statusCell.locator('.vc-state')).toHaveClass(/is-success|is-error/, {
      timeout: 15_000,
    });
    await expect(statusCell).not.toBeEmpty();
  });

  test('demo mode renders light and dark theme screenshots', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pages', 'demo screenshots are only required for the pages build');

    mkdirSync(SCREENS_DIR, { recursive: true });

    await page.goto('/?demo=1');
    await page.evaluate(() => localStorage.setItem('vcw.theme', 'light'));
    await page.reload();
    await expect(page.locator('.vc-queue table')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: join(SCREENS_DIR, 'demo-light.png'), fullPage: true });

    await page.evaluate(() => localStorage.setItem('vcw.theme', 'dark'));
    await page.reload();
    await expect(page.locator('.vc-queue table')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: join(SCREENS_DIR, 'demo-dark.png'), fullPage: true });
  });
});
