import type { QueueItem, QueueState } from './types';
import {
  estimate as computeEstimate,
  deriveResult,
  correctionKey,
  recordCorrection,
  saveCorrections,
  type Quality,
  type MediaInfo,
  type Estimate,
  type CorrectionStore,
} from './estimator';
import { probe, convertFile } from './convert';
import { makeSink } from './save';

const TWO_GB = 2 * 1024 ** 3;
export const LARGE_FILE_BYTES = TWO_GB;

const DEFAULT_MEAN_DURATION_S = 60;

interface InternalItem {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  state: QueueState;
  info: MediaInfo | null;
  est: Estimate | null;
  progress: number;
  outBytes: number | null;
  savedPct: number | null;
  message: string | null;
}

interface BatchProgress {
  pct: number | null;
  etaS: number | null;
  running: boolean;
}

function toQueueItem(item: InternalItem): QueueItem {
  const estBytes = item.est ? item.est.estBytes : null;
  const estSavedPct = estBytes != null && item.sizeBytes > 0 ? 100 * (1 - estBytes / item.sizeBytes) : null;
  return {
    id: item.id,
    name: item.name,
    sizeBytes: item.sizeBytes,
    state: item.state,
    estBytes,
    estSavedPct,
    progress: item.progress,
    outBytes: item.outBytes,
    savedPct: item.savedPct,
    message: item.message,
  };
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class Queue {
  private items: InternalItem[] = [];
  private quality: Quality;
  private readonly store: CorrectionStore;
  private readonly onUpdate: () => void;
  private batch: BatchProgress = { pct: null, etaS: null, running: false };

  constructor(initialQuality: Quality, store: CorrectionStore, onUpdate: () => void) {
    this.quality = initialQuality;
    this.store = store;
    this.onUpdate = onUpdate;
  }

  getItems(): QueueItem[] {
    return this.items.map(toQueueItem);
  }

  getBatchProgress(): BatchProgress {
    return this.batch;
  }

  async addFiles(files: File[]): Promise<void> {
    const newItems: InternalItem[] = files.map((file) => ({
      id: newId(),
      file,
      name: file.name,
      sizeBytes: file.size,
      state: 'queued',
      info: null,
      est: null,
      progress: 0,
      outBytes: null,
      savedPct: null,
      message: null,
    }));
    this.items.push(...newItems);
    this.onUpdate();

    await Promise.all(newItems.map((item) => this.probeItem(item)));
  }

  private async probeItem(item: InternalItem): Promise<void> {
    item.state = 'probing';
    this.onUpdate();

    try {
      const { info, decodable } = await probe(item.file);
      item.info = info;
      if (!decodable) {
        item.state = 'unsupported';
        item.message = "This file's video format can't be decoded on this device.";
      } else {
        item.state = 'ready';
        item.est = computeEstimate(info, this.quality, this.store);
      }
    } catch {
      item.state = 'error';
      item.message = 'Could not read this file — it may be corrupted.';
    }
    this.onUpdate();
  }

  reestimateAll(quality: Quality): void {
    this.quality = quality;
    for (const item of this.items) {
      if (item.state === 'ready' && item.info) {
        item.est = computeEstimate(item.info, this.quality, this.store);
      }
    }
    this.onUpdate();
  }

  async runBatch(dir: FileSystemDirectoryHandle | null, onUpdate: () => void): Promise<void> {
    const readyItems = this.items.filter((item) => item.state === 'ready' && item.est != null);
    if (readyItems.length === 0) return;

    const knownDurations = readyItems
      .map((item) => item.info?.durationS)
      .filter((d): d is number => d != null && d > 0);
    const meanDuration =
      knownDurations.length > 0
        ? knownDurations.reduce((a, b) => a + b, 0) / knownDurations.length
        : DEFAULT_MEAN_DURATION_S;

    const weights = new Map<string, number>();
    for (const item of readyItems) {
      const d = item.info?.durationS;
      weights.set(item.id, d != null && d > 0 ? d : meanDuration);
    }
    const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);

    const startTime = performance.now();
    let doneWeight = 0;

    const updateBatch = (currentWeight: number, currentProgress: number): void => {
      const elapsedS = (performance.now() - startTime) / 1000;
      const fraction = totalWeight > 0 ? (doneWeight + currentWeight * currentProgress) / totalWeight : 0;
      let etaS: number | null = null;
      if (elapsedS > 2 && fraction > 0) {
        etaS = elapsedS / fraction - elapsedS;
      }
      this.batch = { pct: fraction, etaS, running: true };
      onUpdate();
    };

    updateBatch(0, 0);

    for (const item of readyItems) {
      const weight = weights.get(item.id)!;
      const est = item.est!;

      item.state = 'converting';
      item.progress = 0;
      onUpdate();

      let sink: Awaited<ReturnType<typeof makeSink>> | null = null;
      try {
        sink = await makeSink(dir, item.name);

        await convertFile(item.file, est.videoBitrateBps, sink.target, (p) => {
          item.progress = p;
          updateBatch(weight, p);
        });

        item.state = 'saving';
        onUpdate();

        const outBytes = await sink.finalize();
        const result = deriveResult(item.sizeBytes, outBytes);

        item.outBytes = outBytes;
        item.savedPct = result.savedPct;
        item.progress = 1;
        item.state = result.flagged ? 'flagged' : 'done';

        recordCorrection(this.store, correctionKey(this.quality), outBytes, est.estBytes);
        saveCorrections(this.store);
      } catch {
        if (sink) await sink.discard();
        item.state = 'error';
        item.message = "Couldn't convert this file.";
      }

      doneWeight += weight;
      updateBatch(0, 0);
    }

    this.batch = { pct: null, etaS: null, running: false };
    onUpdate();
  }
}
