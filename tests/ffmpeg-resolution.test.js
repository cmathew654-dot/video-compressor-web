import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const temporaryDirectories = [];

async function loadResolver() {
  return import('../scripts/ffmpeg-fixture.mjs');
}

function makePathWithFfmpeg() {
  const directory = mkdtempSync(join(tmpdir(), 'ffmpeg-resolution-'));
  temporaryDirectories.push(directory);

  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffmpegPath = join(directory, executableName);
  copyFileSync(process.execPath, ffmpegPath);
  if (process.platform !== 'win32') {
    chmodSync(ffmpegPath, 0o755);
  }

  return { directory, ffmpegPath: resolve(ffmpegPath) };
}

function makeEmptyPath() {
  const directory = mkdtempSync(join(tmpdir(), 'ffmpeg-resolution-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('resolveFfmpeg', () => {
  it('honors a valid explicit path before a competing PATH candidate', async () => {
    const { directory } = makePathWithFfmpeg();
    const { resolveFfmpeg } = await loadResolver();

    expect(
      resolveFfmpeg({
        explicitPath: process.execPath,
        env: {},
        pathValue: directory,
      }),
    ).toBe(resolve(process.execPath));
  });

  it('discovers ffmpeg from PATH when FFMPEG_PATH is unset', async () => {
    const { directory, ffmpegPath } = makePathWithFfmpeg();
    const { resolveFfmpeg } = await loadResolver();

    expect(
      resolveFfmpeg({
        explicitPath: undefined,
        env: {},
        pathValue: directory,
      }),
    ).toBe(ffmpegPath);
  });

  it('rejects a nonexistent explicit path instead of falling back to PATH', async () => {
    const { directory } = makePathWithFfmpeg();
    const { resolveFfmpeg } = await loadResolver();

    expect(() =>
      resolveFfmpeg({
        explicitPath: join(directory, 'missing-ffmpeg'),
        env: {},
        pathValue: directory,
      }),
    ).toThrow(/explicit/i);
  });

  it('explains how to configure FFmpeg when neither FFMPEG_PATH nor PATH resolves it', async () => {
    const emptyPath = makeEmptyPath();
    const { resolveFfmpeg } = await loadResolver();

    let thrown;
    try {
      resolveFfmpeg({
        explicitPath: undefined,
        env: {},
        pathValue: emptyPath,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = thrown.message;
    expect(message).toMatch(/FFMPEG_PATH/);
    expect(message).toMatch(/PATH/);
    expect(message).toMatch(/set|add|configure|install/i);
  });
});
