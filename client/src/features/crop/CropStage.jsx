/**
 * Interactive canvas stage overlay for dragging and resizing the crop rectangle.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import { useEditor } from '../../state/EditorProvider.jsx';
import { renderGeometry } from '../../engine/geometry.js';
import { applyAdjustments } from '../../engine/pipeline.js';
import { useCrop } from './CropProvider.jsx';

const DISPLAY_MAX = 1400;

function useCropBackdrop() {
  const { image, geometry, adjustments } = useEditor();
  const canvas = useMemo(() => {
    const out = renderGeometry(image.bitmap, { ...geometry, flipH: false, crop: { x: 0, y: 0, width: 1, height: 1 } }, DISPLAY_MAX);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    applyAdjustments(pixels.data, pixels.data, out.width, out.height, adjustments);
    ctx.putImageData(pixels, 0, 0);
    return out;
  }, [image, geometry.quarterTurns, geometry.straighten, adjustments]);
  return canvas;
}

export function CropStage() {
  const { frame, rect, setRect, aspect, applyCrop, cancelCrop } = useCrop();
  const backdrop = useCropBackdrop();
  const imageRef = useRef(null);
  const cropperRef = useRef(null);
  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    if (backdrop) {
      setImageSrc(backdrop.toDataURL());
    }
  }, [backdrop]);

  useEffect(() => {
    const imgEl = imageRef.current;
    if (!imgEl || !imageSrc || !backdrop || !frame) return;

    const cropper = new Cropper(imgEl, {
      viewMode: 1,
      aspectRatio: aspect || NaN,
      autoCropArea: 0.9,
      dragMode: 'move',
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      ready() {
        if (rect && backdrop.width && frame.W) {
          const scale = backdrop.width / frame.W;
          cropper.setData({
            x: rect.x * scale,
            y: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
          });
        }
      },
      crop(e) {
        const d = e.detail;
        if (!backdrop.width || !frame.W) return;
        const scale = frame.W / backdrop.width;
        setRect({
          x: d.x * scale,
          y: d.y * scale,
          width: d.width * scale,
          height: d.height * scale,
        });
      },
    });

    cropperRef.current = cropper;

    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [imageSrc, backdrop, frame]);

  useEffect(() => {
    if (cropperRef.current) {
      cropperRef.current.setAspectRatio(aspect || NaN);
    }
  }, [aspect]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCrop();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCrop();
      } else if (e.key.startsWith('Arrow') && cropperRef.current && backdrop) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 2) * (cropperRef.current.getImageData()?.width / backdrop.width || 1);
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const move = moves[e.key];
        if (move) cropperRef.current.move(move[0], move[1]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyCrop, cancelCrop, backdrop]);

  return (
    <div className="relative size-full flex items-center justify-center p-4 lg:p-8 select-none touch-none">
      <div className="relative max-h-full max-w-full overflow-hidden rounded-xl shadow-2xl">
        {imageSrc && (
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Crop area"
            className="block max-h-[calc(100vh-160px)] max-w-full object-contain"
          />
        )}
      </div>

      <p className="glass hairline pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-lg px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white/70 lg:block">
        Drag the box or its handles · arrows to nudge · ↵ to apply · Esc to cancel
      </p>

      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 lg:hidden">
        <button type="button" onClick={cancelCrop} className="glass hairline h-10 rounded-xl px-4 text-[13px] font-bold">
          Cancel
        </button>
        <span className="truncate text-[11px] font-semibold text-white/60">Drag box or corners</span>
        <button type="button" onClick={applyCrop} className="h-10 rounded-xl bg-white px-4 text-[13px] font-extrabold text-ink-950">
          Apply
        </button>
      </div>
    </div>
  );
}
