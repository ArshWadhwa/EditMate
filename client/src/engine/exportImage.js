import { renderGeometry, readPixels } from './geometry.js';
import { applyAdjustments } from './pipeline.js';
import { compose, hasComposition } from './composite.js';
import { loadLayerFonts } from './layers.js';

/**
 * Export formats. `mime` is what the canvas encodes; PDF wraps a JPEG.
 * `alpha` formats keep transparency; the others are flattened onto white.
 */
export const EXPORT_FORMATS = [
  { key: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', alpha: false, lossy: true, hint: 'Smallest for photos' },
  { key: 'png', label: 'PNG', mime: 'image/png', extension: 'png', alpha: true, lossy: false, hint: 'Lossless, keeps transparency' },
  { key: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp', alpha: true, lossy: true, hint: 'Small, keeps transparency' },
  { key: 'avif', label: 'AVIF', mime: 'image/avif', extension: 'avif', alpha: true, lossy: true, hint: 'Smallest, newest browsers' },
  { key: 'pdf', label: 'PDF', mime: 'image/jpeg', extension: 'pdf', alpha: false, lossy: true, hint: 'For printing and sharing' },
];

/** Longest-edge presets; `null` keeps full resolution. */
export const EXPORT_SIZES = [
  { key: 'full', label: 'Original', maxEdge: null },
  { key: '4096', label: '4K', maxEdge: 4096 },
  { key: '2048', label: '2048 px', maxEdge: 2048 },
  { key: '1080', label: '1080 px', maxEdge: 1080 },
];

export const formatFor = (key) => EXPORT_FORMATS.find((f) => f.key === key) ?? EXPORT_FORMATS[0];

const encodeSupport = new Map();
/** Browsers silently fall back to PNG for MIME types they can't encode; detect that once per type. */
export async function canEncode(mime) {
  if (!encodeSupport.has(mime)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    encodeSupport.set(mime, new Promise((resolve) => canvas.toBlob((b) => resolve(b?.type === mime), mime)));
  }
  return encodeSupport.get(mime);
}

/** The original's format when we can write it, otherwise JPEG. */
export function defaultFormatFor(mimeType) {
  return EXPORT_FORMATS.find((f) => f.mime === mimeType && f.key !== 'pdf')?.key ?? 'jpeg';
}

/**
 * Renders the edit at full resolution: geometry → pixel pipeline (worker) → background +
 * layers composite. Returns a canvas; nothing is ever captured from the UI.
 */
export async function renderFull({ bitmap, doc, mask, assets }) {
  const photo = renderGeometry(bitmap, doc.geometry, Infinity);
  const { data } = readPixels(photo);
  applyAdjustments(data, data, photo.width, photo.height, doc.adjustments);
  photo.getContext('2d').putImageData(new ImageData(data, photo.width, photo.height), 0, 0);
  if (!hasComposition(doc)) return photo;

  await loadLayerFonts(doc.layers);
  const fullMask = mask ? renderGeometry(mask, doc.geometry, Infinity) : null;
  return compose(document.createElement('canvas'), { photo, mask: fullMask, ...doc, assets });
}

/** Downscales (never upscales) to `maxEdge`, flattening onto white for formats without alpha. */
function prepareCanvas(source, { maxEdge, flatten }) {
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(source.width, source.height)) : 1;
  if (scale === 1 && !flatten) return source;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  const ctx = out.getContext('2d');
  if (flatten) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

const toBlob = (canvas, mime, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this image'))), mime, quality),
  );

/**
 * @param {HTMLCanvasElement} canvas  output of renderFull
 * @param {{ format: string, quality: number, maxEdge: number|null, title?: string }} options
 */
export async function encodeExport(canvas, { format, quality, maxEdge, title }) {
  const spec = formatFor(format);
  if (!(await canEncode(spec.mime))) throw new Error(`This browser can't save ${spec.label} files`);

  // Flatten always for non-alpha formats: transparent pixels would otherwise turn black.
  const prepared = prepareCanvas(canvas, { maxEdge, flatten: !spec.alpha });
  const blob = await toBlob(prepared, spec.mime, spec.lossy ? quality : undefined);
  if (spec.key !== 'pdf') return blob;

  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return jpegToPdf(jpeg, prepared.width, prepared.height, { title });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFilename(originalName, format) {
  const base = originalName.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-editmate.${formatFor(format).extension}`;
}

/**
 * Minimal single-page PDF writer: embeds one JPEG as-is (DCTDecode).
 */
export function jpegToPdf(jpegBytes, widthPx, heightPx, { dpi = 300, title = 'EditMate export' } = {}) {
  const encoder = new TextEncoder();
  const pageW = ((widthPx * 72) / dpi).toFixed(2);
  const pageH = ((heightPx * 72) / dpi).toFixed(2);
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  const escapedTitle = title.replace(/[\\()]/g, (c) => `\\${c}`);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title (${escapedTitle}) /Producer (EditMate) >>`,
  ];

  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  push('%PDF-1.4\n%âãÏÓ\n');
  objects.forEach((body, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n`);
    if (body === null) {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      );
      push(jpegBytes);
      push('\nendstream');
    } else {
      push(body);
    }
    push('\nendobj\n');
  });

  const xrefStart = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}
