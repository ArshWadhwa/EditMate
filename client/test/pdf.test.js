import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jpegToPdf } from '../src/engine/exportImage.js';

test('writes a valid single-page PDF around the JPEG bytes', async () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const blob = jpegToPdf(fakeJpeg, 3000, 1500, { dpi: 300, title: 'Trip (1)' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);

  assert.equal(blob.type, 'application/pdf');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/MediaBox \[0 0 720\.00 360\.00\]/); // 3000 px at 300 dpi = 10 in = 720 pt
  assert.match(text, /\/Title \(Trip \\\(1\\\)\)/);

  // Every xref offset must point exactly at its "N 0 obj" header, and startxref at "xref".
  const xrefStart = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xrefStart, xrefStart + 4), 'xref');
  const offsets = [...text.slice(xrefStart).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));

  // The image stream contains the JPEG untouched.
  const start = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 'stream\n'.length;
  assert.deepEqual([...bytes.slice(start, start + fakeJpeg.length)], [...fakeJpeg]);
});
