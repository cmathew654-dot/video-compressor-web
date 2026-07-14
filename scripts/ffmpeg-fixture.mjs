#!/usr/bin/env node
// Portable FFmpeg resolution and deterministic test-fixture generation.
//
// Resolution precedence: explicit path > FFMPEG_PATH env var > PATH search.
// Never searches arbitrary user directories and never invents a machine-specific fallback.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG_NAMES = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];

function isExecutableFile(candidatePath) {
  try {
    return statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

function resolveOrThrow(candidatePath, label) {
  const resolved = resolve(candidatePath);
  if (!isExecutableFile(resolved)) {
    throw new Error(
      `FFmpeg was not found at the ${label} ("${candidatePath}"). ` +
        'Fix or remove that setting -- it does not fall back to PATH.',
    );
  }
  return resolved;
}

function searchPath(pathValue) {
  if (!pathValue) return undefined;
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    for (const name of FFMPEG_NAMES) {
      const candidate = join(dir, name);
      if (isExecutableFile(candidate)) return resolve(candidate);
    }
  }
  return undefined;
}

/**
 * Resolve an FFmpeg executable using explicit path > FFMPEG_PATH env var > PATH search.
 * Throws an actionable error if none of the three sources resolves.
 */
export function resolveFfmpeg({ explicitPath, env = {}, pathValue } = {}) {
  if (explicitPath) {
    return resolveOrThrow(explicitPath, 'explicit path');
  }

  if (env.FFMPEG_PATH) {
    return resolveOrThrow(env.FFMPEG_PATH, 'FFMPEG_PATH environment variable');
  }

  const resolvedPathValue = pathValue ?? env.PATH;
  const fromPath = searchPath(resolvedPathValue);
  if (fromPath) return fromPath;

  throw new Error(
    'Could not find an FFmpeg executable. Set the FFMPEG_PATH environment variable to an ' +
      'ffmpeg executable, or add ffmpeg to your PATH, then install FFmpeg if it is missing.',
  );
}

function isInsideTempRoot(candidatePath) {
  const tempRoot = resolve(tmpdir());
  const rel = relative(tempRoot, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Write a deterministic, minimal H.264/AAC test video to `outputPath`.
 * Refuses to overwrite an existing file unless that file lives inside the OS temp
 * directory (i.e. a caller-supplied unique per-run temp path), so it can never
 * clobber a real, unrelated file on disk.
 */
export function makeFixture({
  ffmpegPath,
  outputPath,
  durationSeconds = 5,
  width = 1280,
  height = 720,
  fps = 30,
} = {}) {
  if (!ffmpegPath) throw new Error('makeFixture requires an ffmpegPath.');
  if (!outputPath) throw new Error('makeFixture requires an outputPath.');

  const resolvedOutput = resolve(outputPath);
  if (existsSync(resolvedOutput) && !isInsideTempRoot(resolvedOutput)) {
    throw new Error(
      `Refusing to overwrite "${resolvedOutput}" -- makeFixture only overwrites paths inside ` +
        `the OS temp directory (${tmpdir()}).`,
    );
  }

  mkdirSync(dirname(resolvedOutput), { recursive: true });

  const result = spawnSync(
    ffmpegPath,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationSeconds}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${durationSeconds}`,
      '-c:v',
      'libx264',
      '-b:v',
      '3000k',
      '-c:a',
      'aac',
      '-shortest',
      resolvedOutput,
    ],
    { encoding: 'utf-8' },
  );

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed to generate the fixture (exit ${result.status}): ${(result.stderr ?? '').trim()}`,
    );
  }

  return resolvedOutput;
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ffmpeg-path') args.ffmpegPath = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--force') args.force = true;
  }
  return args;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolve(args.output ?? join(process.cwd(), 'tests', 'fixtures', 'fixture.mp4'));

  if (existsSync(outputPath) && !args.force) {
    console.log(`Fixture already exists at ${outputPath} (use --force to regenerate). Skipping.`);
    process.exit(0);
  }

  try {
    const ffmpegPath = resolveFfmpeg({
      explicitPath: args.ffmpegPath,
      env: process.env,
      pathValue: process.env.PATH,
    });

    if (existsSync(outputPath) && args.force) {
      rmSync(outputPath, { force: true });
    }

    makeFixture({ ffmpegPath, outputPath });
    console.log(`Fixture written to ${outputPath}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
