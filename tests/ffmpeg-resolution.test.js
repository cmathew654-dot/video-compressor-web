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
  it('honors a valid FFMPEG_PATH before PATH', async () => {
    const { resolveFfmpeg } = await loadResolver();

    expect(
      resolveFfmpeg({
        explicitPath: undefined,
        env: { FFMPEG_PATH: process.execPath },
        pathValue: '',
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

  it('rejects a nonexistent FFMPEG_PATH instead of falling back to PATH', async () => {
    const { directory } = makePathWithFfmpeg();
    const { resolveFfmpeg } = await loadResolver();

    expect(() =>
      resolveFfmpeg({
        explicitPath: undefined,
        env: { FFMPEG_PATH: join(directory, 'missing-ffmpeg') },
        pathValue: directory,
      }),
    ).toThrow(/FFMPEG_PATH/i);
  });

  it('explains how to configure FFmpeg when neither FFMPEG_PATH nor PATH resolves it', async () => {
    const emptyPath = makeEmptyPath();
    const { resolveFfmpeg } = await loadResolver();

    expect(() =>
      resolveFfmpeg({
        explicitPath: undefined,
        env: {},
        pathValue: emptyPath,
      }),
    ).toThrow(/FFMPEG_PATH|PATH/i);
  });
});
