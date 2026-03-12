import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Test whether the browser can natively play the given file.
 * Returns a promise that resolves true (native playback works) or
 * false (unsupported — needs transcoding).
 */
export function canBrowserPlayNatively(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = (result) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.src = '';
      resolve(result);
    };

    // If metadata loads successfully, the browser can play it
    video.onloadedmetadata = () => cleanup(true);
    // If the browser throws an error, it can't decode the format
    video.onerror = () => cleanup(false);
    // Fallback: if nothing fires in 6 s, assume unsupported
    const timer = setTimeout(() => cleanup(false), 6000);

    video.src = url;
  });
}

/**
 * Transcode any video file to H.264 MP4 using FFmpeg WASM.
 * @param {File|Blob} file     — source video
 * @param {Function}  onProgress — called with a 0–1 progress value
 * @returns {Promise<Blob>}    — H.264 MP4 blob
 */
export async function transcodeToH264(file, onProgress) {
  const ffmpeg = new FFmpeg();

  const base = `${window.location.origin}${process.env.PUBLIC_URL}/ffmpeg`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1));
  });

  // Preserve extension so FFmpeg can detect the input container
  const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'video';
  const inputName = `input.${ext}`;
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  await ffmpeg.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'fast',   // balance speed vs file size
    '-crf', '22',        // quality (18=near-lossless, 28=smaller file)
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart', // optimise for streaming/web playback
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  return new Blob([data.buffer], { type: 'video/mp4' });
}
