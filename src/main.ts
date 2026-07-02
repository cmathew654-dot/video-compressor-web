import { initUi, demoItems } from './ui';
import type { UiCallbacks, UiHandles } from './types';
import { QUALITY_LABELS, DEFAULT_QUALITY, loadCorrections, type Quality } from './estimator';
import { Queue, LARGE_FILE_BYTES } from './queue';
import { chooseDirectory, dirPickerAvailability, type DirAvailability } from './save';

const DIR_UNAVAILABLE_MESSAGE: Record<Exclude<DirAvailability, 'ok'>, string> = {
  'file-protocol': 'Folder saving is unavailable for a local file — outputs will download instead.',
  unsupported: "This browser can't save to a folder — outputs will download instead.",
};

const QUALITY_ORDER: Quality[] = ['max', 'visually_lossless', 'balanced', 'smaller', 'extra_small'];
const presets = QUALITY_ORDER.map((value) => ({ value, label: QUALITY_LABELS[value] }));

const app = document.getElementById('app');

if (app) {
  if (new URLSearchParams(location.search).get('demo') === '1') {
    const noop: UiCallbacks = {
      onFilesAdded() {},
      onPresetChanged() {},
      onStart() {},
      onChooseDir() {},
    };
    const handles = initUi(app, presets, DEFAULT_QUALITY, noop);
    handles.renderQueue(demoItems());
    handles.renderBatch(0.42, 96, true);
    handles.setStartEnabled(true);
    handles.setDirLabel('Downloads');
  } else {
    let handles: UiHandles;
    let chosenDir: FileSystemDirectoryHandle | null = null;

    function rerender(): void {
      const items = queue.getItems();
      handles.renderQueue(items);

      const batch = queue.getBatchProgress();
      handles.renderBatch(batch.pct, batch.etaS, batch.running);

      const hasReady = items.some((item) => item.state === 'ready');
      handles.setStartEnabled(hasReady && !batch.running);
    }

    const queue = new Queue(DEFAULT_QUALITY, loadCorrections(), rerender);

    async function onChooseDir(): Promise<void> {
      const result = await chooseDirectory();
      if (result.kind === 'chosen') {
        chosenDir = result.handle;
        handles.setDirLabel(result.handle.name);
      } else if (result.kind === 'unavailable') {
        handles.setDirLabel(DIR_UNAVAILABLE_MESSAGE[result.why]);
        handles.setChooseDirEnabled(false);
      }
      // cancelled: user closed the picker — keep whatever was set before.
    }

    async function onStart(): Promise<void> {
      const readyItems = queue.getItems().filter((item) => item.state === 'ready');
      if (readyItems.length === 0) return;

      if (!chosenDir && readyItems.some((item) => item.sizeBytes > LARGE_FILE_BYTES)) {
        const proceed = confirm('Without a save folder, large outputs are held in memory. Continue?');
        if (!proceed) return;
      }

      await queue.runBatch(chosenDir, rerender);
      rerender();
    }

    const callbacks: UiCallbacks = {
      onFilesAdded: (files) => {
        void queue.addFiles(files);
      },
      onPresetChanged: (value) => queue.reestimateAll(value as Quality),
      onStart: () => {
        void onStart();
      },
      onChooseDir: () => {
        void onChooseDir();
      },
    };

    handles = initUi(app, presets, DEFAULT_QUALITY, callbacks);
    handles.setStartEnabled(false);

    const availability = dirPickerAvailability();
    if (availability === 'ok') {
      handles.setDirLabel(null);
    } else {
      handles.setDirLabel(DIR_UNAVAILABLE_MESSAGE[availability]);
      handles.setChooseDirEnabled(false);
    }
  }
}
