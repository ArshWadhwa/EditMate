/**
 * Subject segmentation (background cutout) pipeline.
 * Runs in-browser using ISNet FP16 via @imgly/background-removal (ONNX Runtime Web).
 */

const INPUT_MAX = 2048;

/**
 * Rescales bitmap if larger than maximum model input threshold.
 *
 * @param {ImageBitmap} bitmap
 * @returns {HTMLCanvasElement}
 */
function toInputCanvas(bitmap) {
  const scale = Math.min(1, INPUT_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Generates a full-resolution alpha mask separating the foreground subject from the background.
 *
 * @param {ImageBitmap} bitmap - Source image
 * @param {(fraction: number, phase: 'download' | 'inference') => void} [onProgress]
 * @returns {Promise<HTMLCanvasElement>} Full-size alpha mask canvas
 */
export async function segmentSubject(bitmap, onProgress) {
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
