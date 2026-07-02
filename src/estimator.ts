export type Quality = 'max' | 'visually_lossless' | 'balanced' | 'smaller' | 'extra_small';

export const QUALITY_LABELS: Record<Quality, string> = {
  max: 'Max',
  visually_lossless: 'Visually lossless',
  balanced: 'Balanced',
  smaller: 'Smaller',
  extra_small: 'Extra small',
};

export const DEFAULT_QUALITY: Quality = 'visually_lossless';

export interface MediaInfo {
  durationS: number;
  width: number | null;
  height: number | null;
  bitrateKbps: number;
}

export interface Estimate {
  estKbps: number;
  videoBitrateBps: number;
  estBytes: number;
  correction: number;
}

export type CorrectionStore = Record<string, number[]>;

export interface DerivedResult {
  savedBytes: number;
  savedPct: number;
  flagged: boolean;
}

// h264-only app: HEVC ratios are the baseline, h264 ratio is derived (h264 is less
// efficient than HEVC, so it needs a higher fraction of the source bitrate).
const HEVC_RATIOS: Record<Quality, number> = {
  max: 0.85,
  visually_lossless: 0.6,
  balanced: 0.4,
  smaller: 0.25,
  extra_small: 0.18,
};

const QUALITY_FACTORS: Record<Quality, number> = {
  max: 2.2,
  visually_lossless: 1.6,
  balanced: 1.0,
  smaller: 0.6,
  extra_small: 0.45,
};

const REF_1080P_H264_KBPS = 4000;
const AUDIO_KBPS = 160;
const REF_WIDTH = 1920;
const REF_HEIGHT = 1080;
const MIN_VIDEO_BITRATE_BPS = 100_000;
const MAX_CORRECTIONS_KEPT = 10;

function h264Ratio(q: Quality): number {
  return Math.min(HEVC_RATIOS[q] * 1.4, 0.95);
}

export function correctionKey(q: Quality): string {
  return `h264|${q}`;
}

export function medianCorrection(store: CorrectionStore, key: string): number {
  const list = store[key];
  if (!list || list.length === 0) return 1.0;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function recordCorrection(
  store: CorrectionStore,
  key: string,
  actualBytes: number,
  predictedBytes: number,
): CorrectionStore {
  if (predictedBytes <= 0) return store;
  const ratio = actualBytes / predictedBytes;
  const existing = store[key] ?? [];
  store[key] = [...existing, ratio].slice(-MAX_CORRECTIONS_KEPT);
  return store;
}

export function estimate(info: MediaInfo, q: Quality, store: CorrectionStore): Estimate {
  const width = info.width ?? REF_WIDTH;
  const height = info.height ?? REF_HEIGHT;
  const resFactor = (width * height) / (REF_WIDTH * REF_HEIGHT);
  const qf = QUALITY_FACTORS[q];
  const refKbps = REF_1080P_H264_KBPS * resFactor * qf + AUDIO_KBPS;
  const ratio = h264Ratio(q);
  const estKbps = Math.min(info.bitrateKbps * ratio, refKbps);
  const correction = medianCorrection(store, correctionKey(q));
  const estBytes = Math.round(((estKbps * 1000) / 8) * info.durationS * correction);
  const videoBitrateBps = Math.max(MIN_VIDEO_BITRATE_BPS, Math.round((estKbps - AUDIO_KBPS) * 1000));
  return { estKbps, videoBitrateBps, estBytes, correction };
}

export function deriveResult(inBytes: number, outBytes: number): DerivedResult {
  const savedBytes = inBytes - outBytes;
  const savedPct = inBytes === 0 ? 0 : (savedBytes / inBytes) * 100;
  const flagged = outBytes >= inBytes;
  return { savedBytes, savedPct, flagged };
}

const STORAGE_KEY = 'vcw.corrections';

export function loadCorrections(): CorrectionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CorrectionStore) : {};
  } catch {
    return {};
  }
}

export function saveCorrections(store: CorrectionStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable (e.g. private mode, non-browser env) - in-memory only.
  }
}
