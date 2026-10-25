/**
 * Subject segmentation and background cutout engine using BiRefNet with ISNet fallback.
 */

const INPUT_MAX = 1024; 

let birefnetPromise = null;

async function getBiRefNet(onProgress) {
  if (!birefnetPromise) {
    birefnetPromise = (async () => {
      const { AutoModel, AutoProcessor, env } = await import('@huggingface/transformers');

      env.allowLocalModels = false;

      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const device = hasWebGPU ? 'webgpu' : 'wasm';
      const modelId = 'onnx-community/BiRefNet_lite-ONNX';

      let model;
      try {
        model = await AutoModel.from_pretrained(modelId, {
          device,
          dtype: 'fp16',
          progress_callback: (p) => {
            if (onProgress && p?.status === 'progress' && p.total) {
              onProgress(Math.min(1, p.loaded / p.total), 'download');
            }
          },
        });
      } catch (err) {
        console.warn(`WebGPU BiRefNet load failed (${err.message}), falling back to wasm CPU...`);
        model = await AutoModel.from_pretrained(modelId, {
          device: 'wasm',
          dtype: 'fp32',
          progress_callback: (p) => {
            if (onProgress && p?.status === 'progress' && p.total) {
              onProgress(Math.min(1, p.loaded / p.total), 'download');
            }
          },
        });
      }

      const processor = await AutoProcessor.from_pretrained(modelId);
      return { model, processor };
    })();
  }
  return birefnetPromise;
}

function toInputCanvas(bitmap) {
  const scale = Math.min(1, INPUT_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function segmentWithBiRefNet(bitmap, onProgress) {
  const { RawImage } = await import('@huggingface/transformers');
  const inputCanvas = toInputCanvas(bitmap);

  onProgress?.(0.1, 'download');
  const { model, processor } = await getBiRefNet(onProgress);
  onProgress?.(0.3, 'inference');

  const blob = await new Promise((resolve) => inputCanvas.toBlob(resolve, 'image/png'));
  const rawImage = await RawImage.fromBlob(blob);

  onProgress?.(0.5, 'inference');
  const { pixel_values } = await processor(rawImage);

  onProgress?.(0.7, 'inference');
  const { output_image } = await model({ input_image: pixel_values });

  onProgress?.(0.9, 'inference');
  const maskRaw = await RawImage.fromTensor(
    output_image[0].sigmoid().mul(255).to('uint8')
  ).resize(bitmap.width, bitmap.height);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = bitmap.width;
  maskCanvas.height = bitmap.height;
  const ctx = maskCanvas.getContext('2d');
  const imgData = ctx.createImageData(bitmap.width, bitmap.height);

  const data = imgData.data;
  const alphaData = maskRaw.data;
  for (let i = 0, p = 0; i < alphaData.length; i++, p += 4) {
    data[p] = 255;
    data[p + 1] = 255;
    data[p + 2] = 255;
    data[p + 3] = alphaData[i];
  }
  ctx.putImageData(imgData, 0, 0);
  onProgress?.(1.0, 'inference');

  return maskCanvas;
}

async function segmentWithISNet(bitmap, onProgress) {
  const { removeBackground } = await import('@imgly/background-removal');

  const input = await new Promise((resolve) => toInputCanvas(bitmap).toBlob(resolve, 'image/png'));
  const result = await removeBackground(input, {
    model: 'isnet_quint8',
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

export async function segmentSubject(bitmap, onProgress) {
  try {
    return await segmentWithBiRefNet(bitmap, onProgress);
  } catch (err) {
    console.warn('BiRefNet segmentation failed, falling back to ISNet:', err);
    return await segmentWithISNet(bitmap, onProgress);
  }
}
