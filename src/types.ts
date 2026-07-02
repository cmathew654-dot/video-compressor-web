export type QueueState = 'queued'|'probing'|'ready'|'converting'|'saving'|'done'|'error'|'unsupported'|'flagged';
export interface QueueItem {
  id: string; name: string; sizeBytes: number; state: QueueState;
  estBytes: number|null; estSavedPct: number|null;
  progress: number;              // 0..1 during converting/saving
  outBytes: number|null; savedPct: number|null;
  message: string|null;          // human text for error/unsupported/flagged
}
export interface UiCallbacks { onFilesAdded(files: File[]): void; onPresetChanged(value: string): void; onStart(): void; onChooseDir(): void; }
export interface UiHandles {
  renderQueue(items: QueueItem[]): void;
  renderBatch(pct: number|null, etaS: number|null, running: boolean): void;
  setStartEnabled(enabled: boolean): void;
  setDirLabel(label: string|null): void;
  setChooseDirEnabled(enabled: boolean): void;
}
