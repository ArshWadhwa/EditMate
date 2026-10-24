/**
 * Subject segmentation ("remove background").
 *
 * This is the only file that knows which model is used. It returns a canvas the size of the
 * original photo whose alpha channel is the subject, which `compose()` uses with
 * `destination-in`. Swap the implementation here to change providers (e.g. a server API).
 *
 * Current provider: @imgly/background-removal (ISNet via ONNX Runtime Web), running locally.
 * The model (~40–80 MB) is fetched from img.ly's CDN on first use and cached by the browser.
 * Licence: AGPL-3.0. Commercial distribution needs img.ly's commercial licence or another provider.
 */

/** Model input is ~1024 px internally; larger inputs only cost time. */
const INPUT_MAX = 2048;

function toInputCanvas(bitmap) {
  const scale = Math.min(1, INPUT_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * @param {ImageBitmap} bitmap original photo (EXIF-oriented)
 * @param {(fraction: number, phase: 'download' | 'inference') => void} [onProgress]
 * @returns {Promise<HTMLCanvasElement>} mask at the photo's full size
 */
export async function segmentSubject(bitmap, onProgress) {
  // Lazy-loaded: the library and ONNX runtime stay out of the main bundle until needed.
  const { removeBackground } = await import('@imgly/background-removal');

  const input = await new Promise((resolve) => toInputCanvas(bitmap).toBlob(resolve, 'image/png'));
  const result = await removeBackground(input, {
    model: 'isnet_fp16',
    proxyToWorker: true,
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (!onProgress || !total) return;
      onProgress(current / total, key.startsWith('fetch') ? 'download' : 'inference');
    },
  });

  const cutout = await createImageBitmap(result);
  const mask = document.createElement('canvas');
  mask.width = bitmap.width;
  mask.height = bitmap.height;
  const ctx = mask.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cutout, 0, 0, mask.width, mask.height);
  cutout.close();
  return mask;
}
