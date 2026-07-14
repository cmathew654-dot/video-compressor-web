# Video Compressor

A browser-based batch video compressor. Drop in video files, pick a quality preset, and it re-encodes them to smaller H.264 files using your browser's built-in video codec (WebCodecs) — no upload, no server, no account.

Your files never leave your computer.

## Why trust it

The production build ships with a `Content-Security-Policy` meta tag whose `connect-src` directive is set to `'none'`. That directive blocks the browser APIs a page would use to reach a server on its own — fetch, XHR, WebSocket, EventSource, and `sendBeacon` — outright. There is no upload endpoint and no application backend for this app to talk to in the first place, so nothing on the page has a way to send your files anywhere or phone home. That's not a promise, it's a browser-enforced restriction. You don't have to take this README's word for it:

- Open DevTools → Network while using the app. You'll see it stay empty during compression.
- Try it in airplane mode. It still works, because it never needed a connection.
- View Source. Every line of the page is plain, readable HTML/CSS/JS — nothing minified beyond normal bundling, nothing obfuscated.

There's also a single-file variant (see Usage) — one `.html` file with everything inlined, so you can save it locally and inspect or run it without even fetching it from a web server.

## Usage

1. Open the hosted URL, or open the single HTML file directly in your browser (double-click it, or drag it into a browser window).
2. Drop one or more video files onto the page, or click the drop zone to choose files.
3. Once a file finishes probing, pick a quality preset — the estimated output size updates immediately.
4. Optionally click **Save to folder…** to pick a destination on disk. Without a folder chosen, each finished file downloads normally through your browser.
5. Click **Start**. Progress shows per-file and for the whole batch.

## Quality presets

| Preset | What it means |
|-|-|
| Max | Minimal quality loss, largest output. For footage you'll edit further. |
| Visually lossless | Default. No visible difference at normal viewing distance. |
| Balanced | Noticeably smaller with only minor quality loss. |
| Smaller | Prioritizes file size; loss is visible on close inspection. |
| Extra small | Smallest output, for sharing or archiving where quality matters least. |

Estimated sizes are bitrate-target predictions, not guarantees. Each preset's targets self-correct over time based on how your own actual output sizes compare to the estimate — the more you use a preset, the more accurate its estimate becomes for your content.

## Browser support

Requires a browser with WebCodecs support: current Chrome or Edge. Encoding uses hardware acceleration when the browser and GPU support it, falling back to software encoding otherwise.

## Limits

- Output is always H.264 (`.mp4`), regardless of the source format.
- Sources your browser can't decode are skipped with an explanation in the queue, not a silent failure.
- Very large source files are held in memory until they finish encoding unless you choose a save folder first — for large batches or large files, choose a folder.

## Development

```
pnpm install
pnpm dev           # local dev server
pnpm test          # unit tests (estimator)
pnpm e2e           # end-to-end tests (both build targets, headless Chromium)
pnpm build:pages   # multi-file build → dist/
pnpm build:single  # single-file build → dist-single/index.html
```
