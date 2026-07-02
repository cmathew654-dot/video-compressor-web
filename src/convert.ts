import {
  Input,
  ALL_FORMATS,
  BlobSource,
  Output,
  Mp4OutputFormat,
  Conversion,
  type StreamTarget,
  type BufferTarget,
} from 'mediabunny';
import type { MediaInfo } from './estimator';

export async function probe(file: File): Promise<{ info: MediaInfo; decodable: boolean }> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const durationS = await input.computeDuration();
    const width = videoTrack ? await videoTrack.getDisplayWidth() : null;
    const height = videoTrack ? await videoTrack.getDisplayHeight() : null;
    const bitrateKbps = (file.size * 8) / 1000 / durationS;
    const decodable = videoTrack != null && (await videoTrack.canDecode());

    const info: MediaInfo = { durationS, width, height, bitrateKbps };
    return { info, decodable };
  } finally {
    input.dispose();
  }
}

export async function convertFile(
  file: File,
  videoBitrateBps: number,
  target: StreamTarget | BufferTarget,
  onProgress: (p: number) => void,
): Promise<void> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec: 'avc', bitrate: videoBitrateBps },
    });
    conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();
  } finally {
    input.dispose();
  }
}
