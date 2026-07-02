import { BufferTarget, StreamTarget } from 'mediabunny';

export interface Sink {
  target: StreamTarget | BufferTarget;
  finalize(): Promise<number>;
  /** Best-effort cleanup after a failed conversion; never throws. */
  discard(): Promise<void>;
  outName: string;
}

type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>;

function getDirectoryPicker(): DirectoryPicker | null {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return typeof picker === 'function' ? picker : null;
}

export async function chooseDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (location.protocol === 'file:') return null;
  const picker = getDirectoryPicker();
  if (!picker) return null;
  try {
    return await picker();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null; // user canceled quietly
    return null;
  }
}

function splitStem(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name, { create: false });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false;
    throw err;
  }
}

async function resolveOutName(dir: FileSystemDirectoryHandle | null, srcName: string): Promise<string> {
  const stem = splitStem(srcName);
  const base = `${stem} (compressed).mp4`;
  if (!dir) return base;

  let candidate = base;
  let n = 2;
  while (await fileExists(dir, candidate)) {
    candidate = `${stem} (compressed) (${n}).mp4`;
    n++;
  }
  return candidate;
}

function triggerDownload(blob: Blob, outName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function makeSink(dir: FileSystemDirectoryHandle | null, srcName: string): Promise<Sink> {
  const outName = await resolveOutName(dir, srcName);

  if (!dir) {
    const target = new BufferTarget();
    return {
      target,
      outName,
      async finalize() {
        const blob = new Blob([target.buffer!]);
        triggerDownload(blob, outName);
        return blob.size;
      },
      async discard() {},
    };
  }

  const fileHandle = await dir.getFileHandle(outName, { create: true });
  const writable = await fileHandle.createWritable();
  const target = new StreamTarget(writable);
  return {
    target,
    outName,
    async finalize() {
      // mediabunny closes the writable internally as part of Conversion.execute() ->
      // Output.finalize(); by the time this runs the file is already flushed to disk.
      const file = await fileHandle.getFile();
      return file.size;
    },
    async discard() {
      // Release the write lock (no-op if mediabunny already closed it), then delete
      // the partial output so a failed conversion never leaves a corrupt file behind.
      try {
        await writable.abort();
      } catch {
        /* already closed */
      }
      try {
        await dir.removeEntry(outName);
      } catch {
        /* best effort */
      }
    },
  };
}
