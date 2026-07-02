import { describe, expect, it } from 'vitest';
import {
  correctionKey,
  DEFAULT_QUALITY,
  deriveResult,
  estimate,
  medianCorrection,
  QUALITY_LABELS,
  recordCorrection,
  type CorrectionStore,
  type MediaInfo,
  type Quality,
} from '../src/estimator';

describe('estimate - golden vectors', () => {
  const cases: Array<{
    name: string;
    info: MediaInfo;
    quality: Quality;
    store: CorrectionStore;
    estKbps: number;
    videoBitrateBps: number;
    estBytes: number;
  }> = [
    {
      name: '1080p balanced, empty store',
      info: { durationS: 60, bitrateKbps: 8000, width: 1920, height: 1080 },
      quality: 'balanced',
      store: {},
      estKbps: 4160,
      videoBitrateBps: 4_000_000,
      estBytes: 31_200_000,
    },
    {
      name: '480p extra_small, floor-clamped bitrate, empty store',
      info: { durationS: 10, bitrateKbps: 1000, width: 640, height: 480 },
      quality: 'extra_small',
      store: {},
      estKbps: 252,
      videoBitrateBps: 100_000, // floor clamp: raw (252-160)*1000 = 92_000
      estBytes: 315_000,
    },
    {
      name: '1080p balanced with populated correction store',
      info: { durationS: 60, bitrateKbps: 8000, width: 1920, height: 1080 },
      quality: 'balanced',
      store: { 'h264|balanced': [1.2, 0.8, 1.1] },
      estKbps: 4160,
      videoBitrateBps: 4_000_000,
      estBytes: 34_320_000,
    },
  ];

  it.each(cases)('$name', ({ info, quality, store, estKbps, videoBitrateBps, estBytes }) => {
    const result = estimate(info, quality, store);
    expect(result.estKbps).toBe(estKbps);
    expect(result.videoBitrateBps).toBe(videoBitrateBps);
    expect(result.estBytes).toBe(estBytes);
  });

  it('applies the median correction from the store (vector 3)', () => {
    const result = estimate(
      { durationS: 60, bitrateKbps: 8000, width: 1920, height: 1080 },
      'balanced',
      { 'h264|balanced': [1.2, 0.8, 1.1] },
    );
    expect(result.correction).toBe(1.1);
  });
});

describe('recordCorrection', () => {
  it('keeps only the last 10 entries', () => {
    let store: CorrectionStore = {};
    const key = correctionKey('balanced' as Quality);
    for (let i = 1; i <= 15; i++) {
      store = recordCorrection(store, key, i * 100, 100);
    }
    expect(store[key]).toHaveLength(10);
    // entries 6..15 (ratios 6..15) should remain, oldest 5 dropped
    expect(store[key]).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('ignores predicted <= 0 (no-op)', () => {
    const store: CorrectionStore = {};
    const key = correctionKey('smaller');
    const result = recordCorrection(store, key, 1000, 0);
    expect(result).toBe(store);
    expect(result[key]).toBeUndefined();

    const result2 = recordCorrection(store, key, 1000, -5);
    expect(result2[key]).toBeUndefined();
  });
});

describe('medianCorrection', () => {
  it('returns 1.0 when the key is absent', () => {
    expect(medianCorrection({}, 'h264|balanced')).toBe(1.0);
  });

  it('returns 1.0 when the array is empty', () => {
    expect(medianCorrection({ 'h264|balanced': [] }, 'h264|balanced')).toBe(1.0);
  });

  it('returns the median for an odd-length array', () => {
    expect(medianCorrection({ k: [1.2, 0.8, 1.1] }, 'k')).toBe(1.1);
  });

  it('returns the average of the two middle values for an even-length array', () => {
    expect(medianCorrection({ k: [1.0, 2.0, 3.0, 4.0] }, 'k')).toBe(2.5);
  });
});

describe('deriveResult', () => {
  it('computes savedBytes and savedPct when output is smaller', () => {
    const result = deriveResult(1000, 400);
    expect(result.savedBytes).toBe(600);
    expect(result.savedPct).toBe(60);
    expect(result.flagged).toBe(false);
  });

  it('flags when output >= input', () => {
    expect(deriveResult(1000, 1000).flagged).toBe(true);
    expect(deriveResult(1000, 1200).flagged).toBe(true);
  });

  it('returns 0 savedPct when inBytes is 0', () => {
    const result = deriveResult(0, 0);
    expect(result.savedPct).toBe(0);
  });
});

describe('quality table completeness', () => {
  const qualities = Object.keys(QUALITY_LABELS) as Quality[];

  it('covers all five qualities', () => {
    expect(qualities.sort()).toEqual(
      ['balanced', 'extra_small', 'max', 'smaller', 'visually_lossless'].sort(),
    );
  });

  it('produces a finite, sane estimate for every quality (ratio + factor tables complete)', () => {
    const info: MediaInfo = { durationS: 30, bitrateKbps: 5000, width: 1920, height: 1080 };
    for (const q of qualities) {
      const result = estimate(info, q, {});
      expect(Number.isFinite(result.estKbps)).toBe(true);
      expect(Number.isFinite(result.videoBitrateBps)).toBe(true);
      expect(Number.isFinite(result.estBytes)).toBe(true);
      expect(result.estKbps).toBeGreaterThan(0);
      expect(result.videoBitrateBps).toBeGreaterThanOrEqual(100_000);
    }
  });

  it('DEFAULT_QUALITY is a valid quality', () => {
    expect(qualities).toContain(DEFAULT_QUALITY);
  });
});
