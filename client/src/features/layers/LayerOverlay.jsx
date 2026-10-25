/**
 * Interactive canvas overlay for selecting, moving, and resizing layers.
 */

import { useEffect, useRef } from 'react';
import { Canvas, Rect, FabricObject } from 'fabric';
import { useEditor } from '../../state/EditorProvider.jsx';
import { layoutText } from '../../engine/layers.js';
import { useLayerActions } from './useLayerActions.js';

FabricObject.ownDefaults.borderColor = '#5ac8fa';
FabricObject.ownDefaults.cornerColor = '#ffffff';
FabricObject.ownDefaults.cornerStrokeColor = '#0284c7';
FabricObject.ownDefaults.cornerSize = 10;
FabricObject.ownDefaults.transparentCorners = false;
FabricObject.ownDefaults.cornerStyle = 'rect';
FabricObject.ownDefaults.lockScalingFlip = true;

export function LayerOverlay({ zoom }) {
  const { base, setUi } = useEditor();
  const { layers, selected, select, previewUpdate, commit, update } = useLayerActions();
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const isInteractingRef = useRef(false);

  const W = base?.width || 1;
  const H = base?.height || 1;

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el || !base) return;

    const canvas = new Canvas(el, {
      width: W,
      height: H,
      selection: false,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    canvas.on('selection:created', (e) => {
      const target = e.selected?.[0];
      if (target?.layerId) select(target.layerId);
    });
    canvas.on('selection:updated', (e) => {
      const target = e.selected?.[0];
      if (target?.layerId) select(target.layerId);
    });
    canvas.on('selection:cleared', () => {
      select(null);
    });

    canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj?.layerId) return;
      isInteractingRef.current = true;
      previewUpdate(obj.layerId, { x: obj.left / W, y: obj.top / H });
    });

    canvas.on('object:rotating', (e) => {
      const obj = e.target;
      if (!obj?.layerId) return;
      isInteractingRef.current = true;
      previewUpdate(obj.layerId, { rotation: Math.round(obj.angle % 360) });
    });

    canvas.on('object:modified', (e) => {
      const obj = e.target;
      if (!obj?.layerId) return;

      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      const patch = {
        x: obj.left / W,
        y: obj.top / H,
        w: (obj.width * scaleX) / W,
        rotation: Math.round(obj.angle % 360),
      };

      if (obj.layerType === 'text') {
        const orig = layers.find((l) => l.id === obj.layerId);
        if (orig) patch.size = orig.size * scaleY;
      } else {
        patch.h = (obj.height * scaleY) / H;
      }

      obj.width *= scaleX;
      obj.height *= scaleY;
      obj.scaleX = 1;
      obj.scaleY = 1;

      commit();
      update(obj.layerId, patch);
      setTimeout(() => {
        isInteractingRef.current = false;
      }, 50);
    });

    canvas.on('mouse:dblclick', (e) => {
      if (e.target?.layerId) {
        select(e.target.layerId);
        setUi({ tool: 'layers' });
        if (e.target.layerType === 'text') {
          requestAnimationFrame(() => document.getElementById('layer-text')?.select());
        }
      }
    });

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [base, W, H]);

  useEffect(() => {
    if (fabricRef.current) {
      fabricRef.current.calcOffset();
      const cornerSize = Math.max(7, Math.round(11 / (zoom || 1)));
      fabricRef.current.getObjects().forEach((o) => {
        o.cornerSize = cornerSize;
      });
      fabricRef.current.requestRenderAll();
    }
  }, [zoom]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !base) return;
    if (isInteractingRef.current) return;

    canvas.remove(...canvas.getObjects());

    layers.forEach((layer) => {
      if (layer.hidden) return;

      let w = layer.w * W;
      let h = layer.h * H;
      if (layer.type === 'text') {
        const layout = layoutText(layer, W, H);
        h = layout.height;
      }

      const rect = new Rect({
        left: layer.x * W,
        top: layer.y * H,
        width: Math.max(12, w),
        height: Math.max(12, h),
        originX: 'center',
        originY: 'center',
        angle: layer.rotation || 0,
        fill: 'rgba(0, 0, 0, 0.001)', 
        stroke: 'transparent',
        hasControls: true,
        hasBorders: true,
        cornerSize: Math.max(7, Math.round(11 / (zoom || 1))),
      });

      rect.layerId = layer.id;
      rect.layerType = layer.type;
      canvas.add(rect);

      if (selected && selected.id === layer.id) {
        canvas.setActiveObject(rect);
      }
    });

    canvas.requestRenderAll();
  }, [layers, base, selected?.id, W, H, zoom]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (selected) {
      if (active?.layerId !== selected.id) {
        const match = canvas.getObjects().find((o) => o.layerId === selected.id);
        if (match) {
          canvas.setActiveObject(match);
          canvas.requestRenderAll();
        }
      }
    } else if (active) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }, [selected?.id]);

  if (!base) return null;

  return (
    <div className="fabric-overlay-container absolute inset-0 size-full pointer-events-auto">
      <canvas ref={canvasElRef} className="size-full" />
    </div>
  );
}
