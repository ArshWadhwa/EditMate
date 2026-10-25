/**
 * Utilities for image file loading, canvas conversions, and format detection.
 */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

const MAX_PIXELS = 50_000_000;

export class ImageLoadError extends Error {}

export async function loadImageFile(file) {
  if (!file?.type.startsWith('image/')) throw new ImageLoadError(`“${file?.name ?? 'File'}” isn’t an image`);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageLoadError(`Your browser can’t decode ${formatLabel(file.type)} files. Try JPEG, PNG or WebP.`);
  }

  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new ImageLoadError('That image is over 50 megapixels. Please use a smaller version.');
  }

  return {
    bitmap,
    url: URL.createObjectURL(file),
    name: file.name,
    type: file.type,
    size: file.size,
    width: bitmap.width,
    height: bitmap.height,
  };
}

export function releaseImage(image) {
  if (!image) return;
  image.bitmap.close();
  URL.revokeObjectURL(image.url);
}

export function formatLabel(mimeType) {
  return (mimeType.split('/')[1] ?? 'image').replace('jpeg', 'jpg').toUpperCase();
}

export function firstImageFile(fileList) {
  return [...(fileList ?? [])].find((file) => file.type.startsWith('image/'));
}
