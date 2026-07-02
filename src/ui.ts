import type { QueueItem, QueueState, UiCallbacks, UiHandles } from './types';

type ThemeMode = 'auto' | 'light' | 'dark';

const THEME_KEY = 'vcw.theme';

function formatBytes(bytes: number): string {
  if (bytes < 0) bytes = 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> & { className?: string },
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) Object.assign(node, props);
  if (children) {
    for (const child of children) {
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
  }
  return node;
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', mode);
  }
}

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'auto' || stored === 'light' || stored === 'dark') return stored;
  return 'auto';
}

function stateLabel(state: QueueState): string {
  switch (state) {
    case 'queued': return 'Queued';
    case 'probing': return 'Probing…';
    case 'ready': return 'Ready';
    case 'converting': return 'Converting…';
    case 'saving': return 'Saving…';
    case 'done': return 'Done';
    case 'error': return 'Error';
    case 'unsupported': return 'Unsupported';
    case 'flagged': return 'Flagged';
  }
}

export function initUi(
  root: HTMLElement,
  presets: { value: string; label: string }[],
  defaultPreset: string,
  cb: UiCallbacks
): UiHandles {
  root.innerHTML = '';

  // ---- Theme ----
  let themeMode = getStoredTheme();
  applyTheme(themeMode);

  const header = el('div', { className: 'vc-header' });
  const title = el('h1', {}, ['Video Compressor']);
  const themeToggle = el('button', { className: 'vc-theme-toggle', type: 'button' });
  const renderThemeToggle = () => {
    themeToggle.textContent = themeMode === 'auto' ? 'Theme: Auto' : themeMode === 'light' ? 'Theme: Light' : 'Theme: Dark';
  };
  renderThemeToggle();
  themeToggle.addEventListener('click', () => {
    themeMode = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
    localStorage.setItem(THEME_KEY, themeMode);
    applyTheme(themeMode);
    renderThemeToggle();
  });
  if (themeMode === 'auto' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode === 'auto') applyTheme('auto');
    });
  }
  header.append(title, themeToggle);

  // ---- Drop zone ----
  const fileInput = el('input', {
    className: 'vc-drop-input',
    type: 'file',
    multiple: true,
    accept: 'video/*',
    id: 'file-input',
  });
  const dropZone = el(
    'div',
    { className: 'vc-drop', tabIndex: 0, role: 'button', ariaLabel: 'Add video files' },
    [el('p', {}, [el('strong', {}, ['Drop video files here']), ' or click to choose']), fileInput]
  );
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    cb.onFilesAdded(Array.from(files));
  };
  dropZone.addEventListener('click', (e) => {
    if (e.target !== fileInput) fileInput.click();
  });
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('is-dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
    handleFiles(e.dataTransfer ? e.dataTransfer.files : null);
  });
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  // ---- Controls row ----
  const presetSelect = el('select', { id: 'preset' });
  for (const p of presets) {
    presetSelect.append(el('option', { value: p.value }, [p.label]));
  }
  presetSelect.value = defaultPreset;
  presetSelect.addEventListener('change', () => cb.onPresetChanged(presetSelect.value));

  const chooseDirBtn = el('button', { className: 'vc-btn', id: 'chooseDir', type: 'button' }, ['Save to folder…']);
  chooseDirBtn.addEventListener('click', () => cb.onChooseDir());

  const dirLabel = el('span', { className: 'vc-dir-label' });

  const startBtn = el('button', { className: 'vc-btn', id: 'start', type: 'button', disabled: true }, ['Start']);
  startBtn.addEventListener('click', () => cb.onStart());

  const controls = el('div', { className: 'vc-controls' }, [presetSelect, chooseDirBtn, dirLabel, startBtn]);

  // ---- Queue table ----
  const queueBody = el('tbody');
  const queueTable = el('table', {}, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['Name']),
        el('th', {}, ['Size']),
        el('th', {}, ['Est. out']),
        el('th', {}, ['Est. saved']),
        el('th', {}, ['Status']),
      ]),
    ]),
    queueBody,
  ]);
  const queueEmpty = el('div', { className: 'vc-empty' }, ['No files added yet.']);
  const queueWrap = el('div', { className: 'vc-queue' }, [queueEmpty]);

  // ---- Batch progress ----
  const batchBarFill = el('div', { className: 'vc-bar-fill' });
  const batchBar = el('div', { className: 'vc-bar' }, [batchBarFill]);
  const batchLine = el('div', { className: 'vc-batch-line' });
  const batchPanel = el('div', { className: 'vc-batch', hidden: true }, [batchBar, batchLine]);

  // ---- Transparency panel ----
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const cspCode = el('code', {}, [
    cspMeta && cspMeta.getAttribute('content')
      ? cspMeta.getAttribute('content')!
      : "dev build — the release build embeds a Content-Security-Policy with connect-src 'none'",
  ]);
  const netCount = el('span', { className: 'vc-net-count' }, ['0']);
  const transparency = el('div', { className: 'vc-transparency' }, [
    el('h2', {}, ['Transparency']),
    cspCode,
    el('p', {}, ['External network requests since load: ', netCount]),
    el('p', {}, [
      'Your files never leave this computer. This page cannot make network requests — the browser enforces it (DevTools → Network to verify). Works in airplane mode.',
    ]),
    el('p', {}, ['Every line of this page is readable — View Source.']),
  ]);

  // Count only requests that leave this origin. The page's own css/js/font loads are
  // same-origin resource entries and would show a misleading nonzero number.
  let netRequestCount = 0;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        let external = true;
        try {
          external = new URL(entry.name).origin !== location.origin;
        } catch {
          /* unparseable entry name: count it, never hide it */
        }
        if (external) netRequestCount++;
      }
      netCount.textContent = String(netRequestCount);
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    // PerformanceObserver unavailable; counter stays at 0.
  }

  root.append(header, dropZone, controls, queueWrap, batchPanel, transparency);

  function renderQueue(items: QueueItem[]): void {
    queueBody.innerHTML = '';
    if (items.length === 0) {
      queueWrap.innerHTML = '';
      queueWrap.append(queueEmpty);
      return;
    }
    if (queueWrap.contains(queueEmpty)) {
      queueWrap.innerHTML = '';
      queueWrap.append(queueTable);
    }
    for (const item of items) {
      const statusCell = el('td', { className: 'vc-col-status' });
      if (item.state === 'converting' || item.state === 'saving') {
        const fill = el('div', { className: 'vc-bar-fill' });
        fill.style.transform = `scaleX(${Math.max(0, Math.min(1, item.progress))})`;
        const bar = el('div', { className: 'vc-bar' }, [fill]);
        const label = el('span', { className: 'vc-state' }, [stateLabel(item.state)]);
        statusCell.append(el('div', { className: 'vc-row-progress' }, [bar, label]));
      } else if (item.state === 'done') {
        const parts: string[] = [];
        if (item.outBytes != null) parts.push(formatBytes(item.outBytes));
        if (item.savedPct != null) parts.push(`${formatPct(item.savedPct)} smaller`);
        statusCell.append(el('span', { className: 'vc-state is-success' }, [parts.length ? parts.join(' · ') : 'Done']));
      } else if (item.state === 'error' || item.state === 'unsupported' || item.state === 'flagged') {
        statusCell.append(el('span', { className: 'vc-state is-error' }, [item.message || stateLabel(item.state)]));
      } else {
        statusCell.append(el('span', { className: 'vc-state' }, [stateLabel(item.state)]));
      }

      const row = el('tr', {}, [
        el('td', {}, [item.name]),
        el('td', {}, [formatBytes(item.sizeBytes)]),
        el('td', {}, [item.estBytes != null ? formatBytes(item.estBytes) : '—']),
        el('td', {}, [item.estSavedPct != null ? formatPct(item.estSavedPct) : '—']),
        statusCell,
      ]);
      queueBody.append(row);
    }
  }

  function renderBatch(pct: number | null, etaS: number | null, running: boolean): void {
    batchPanel.hidden = !running;
    if (!running) return;
    const clamped = pct != null ? Math.max(0, Math.min(1, pct)) : 0;
    batchBarFill.style.transform = `scaleX(${clamped})`;
    const pctText = pct != null ? formatPct(pct * 100) : '—';
    const etaText = etaS != null ? `${Math.max(0, Math.round(etaS))}s remaining` : '';
    batchLine.innerHTML = '';
    batchLine.append(el('span', {}, [pctText]), el('span', {}, [etaText]));
  }

  function setStartEnabled(enabled: boolean): void {
    startBtn.disabled = !enabled;
  }

  function setDirLabel(label: string | null): void {
    dirLabel.textContent = label || '';
  }

  function setChooseDirEnabled(enabled: boolean): void {
    chooseDirBtn.disabled = !enabled;
  }

  return { renderQueue, renderBatch, setStartEnabled, setDirLabel, setChooseDirEnabled };
}

export function demoItems(): QueueItem[] {
  return [
    {
      id: '1', name: 'family-vacation-2024.mp4', sizeBytes: 214_000_000, state: 'queued',
      estBytes: null, estSavedPct: null, progress: 0, outBytes: null, savedPct: null, message: null,
    },
    {
      id: '2', name: 'birthday-party.mov', sizeBytes: 88_500_000, state: 'probing',
      estBytes: null, estSavedPct: null, progress: 0, outBytes: null, savedPct: null, message: null,
    },
    {
      id: '3', name: 'drone-footage-lake.mp4', sizeBytes: 512_300_000, state: 'ready',
      estBytes: 210_000_000, estSavedPct: 59, progress: 0, outBytes: null, savedPct: null, message: null,
    },
    {
      id: '4', name: 'wedding-highlights.mp4', sizeBytes: 1_240_000_000, state: 'converting',
      estBytes: 480_000_000, estSavedPct: 61, progress: 0.42, outBytes: null, savedPct: null, message: null,
    },
    {
      id: '5', name: 'conference-talk.mkv', sizeBytes: 640_000_000, state: 'saving',
      estBytes: 300_000_000, estSavedPct: 53, progress: 0.88, outBytes: null, savedPct: null, message: null,
    },
    {
      id: '6', name: 'product-demo-final.mp4', sizeBytes: 96_000_000, state: 'done',
      estBytes: 38_000_000, estSavedPct: 60, progress: 1, outBytes: 37_400_000, savedPct: 61,
      message: null,
    },
    {
      id: '7', name: 'corrupted-clip.mp4', sizeBytes: 12_000, state: 'error',
      estBytes: null, estSavedPct: null, progress: 0, outBytes: null, savedPct: null,
      message: 'Could not read this file — it may be corrupted.',
    },
    {
      id: '8', name: 'screen-recording.avi', sizeBytes: 45_000_000, state: 'unsupported',
      estBytes: null, estSavedPct: null, progress: 0, outBytes: null, savedPct: null,
      message: 'AVI container is not supported by this browser.',
    },
  ];
}
