/**
 * Minimal single-page PDF writer: embeds one JPEG as-is (DCTDecode), so there's no
 * re-encoding and no dependency. The page is sized to the image at `dpi`, which is what
 * print tools use to decide physical size (300 dpi = print quality).
 *
 * Structure: catalog → pages → page → image XObject + content stream, then the xref table.
 */
export function jpegToPdf(jpegBytes, widthPx, heightPx, { dpi = 300, title = 'EditMate export' } = {}) {
  const encoder = new TextEncoder();
  const pageW = ((widthPx * 72) / dpi).toFixed(2);
  const pageH = ((heightPx * 72) / dpi).toFixed(2);
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  const escapedTitle = title.replace(/[\\()]/g, (c) => `\\${c}`);

  // Each entry is the object body; binary image data is spliced in separately.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    null, // image, written below
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

  // The binary comment marks the file as binary for transfer tools.
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
