/**
 * Interactive canvas overlay for selecting, moving, and resizing layers.
 */

import { useEffect, useRef } from 'react';
import { Canvas, Rect, FabricObject } from 'fabric';
import { useEditor } from '../../state/EditorProvider.jsx';
import { layoutText } from '../../engine/layers.js';
import { useLayerActions } from './useLayerActions.js';

/**
 * Intercept Fabric's Canvas mouse event handlers at the prototype level so that
 * right-click (button === 2) completely bypasses Fabric.
 * This allows react-zoom-pan-pinch to receive mousedown and mousemove unblocked,
 * enabling smooth right-click dragging/panning directly on the image.
 */
if (!Canvas.prototype._rightClickPanningPatched) {
  Canvas.prototype._rightClickPanningPatched = true;

  const origOnMouseDown = Canvas.prototype._onMouseDown;
  Canvas.prototype._onMouseDown = function (e) {
    if (e?.button === 2) {
      return;
    }
    return origOnMouseDown.call(this, e);
  };

  const origOnMouseMove = Canvas.prototype._onMouseMove;
  Canvas.prototype._onMouseMove = function (e) {
    if (e?.buttons === 2 || e?.button === 2) {
      return;
    }
    return origOnMouseMove.call(this, e);
  };

  const origOnContextMenu = Canvas.prototype._onContextMenu;
  Canvas.prototype._onContextMenu = function (e) {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    return false;
  };
}

/**
 * Custom control renderers for selected layers.
 * Draws modern circular badge handles with Lucide-styled vector icons:
 * - Rotation handle (mtr): circular badge with curved rotate arrow.
 * - Corner resize handles (tl, tr, bl, br): circular badges with diagonal dual-direction resize arrows.
 * - Edge resize handles (ml, mr, mt, mb): circular badges with linear directional resize arrows.
 */
function renderRotateControl(ctx, left, top, styleOverride, fabricObject) {
  const size = this.sizeX || styleOverride?.cornerSize || fabricObject?.cornerSize || 26;
  ctx.save();
  ctx.translate(left, top);

  // Soft drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = Math.max(3, size * 0.16);
  ctx.shadowOffsetY = Math.max(1, size * 0.06);

  // Badge background
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Badge border
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.stroke();

  // Rotate arrow icon (matching Lucide RotateCw)
  const r = size * 0.24;
  const strokeW = Math.max(1.5, size * 0.09);
  ctx.strokeStyle = '#0284c7';
  ctx.fillStyle = '#0284c7';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const startAngle = -Math.PI * 0.75;
  const endAngle = Math.PI * 0.72;
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle, false);
  ctx.stroke();

  const endX = Math.cos(endAngle) * r;
  const endY = Math.sin(endAngle) * r;
  const head = size * 0.15;
  const tangent = endAngle + Math.PI / 2;

  ctx.beginPath();
  ctx.moveTo(endX - head * Math.cos(tangent - 0.5), endY - head * Math.sin(tangent - 0.5));
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(tangent + 0.5), endY - head * Math.sin(tangent + 0.5));
  ctx.stroke();

  ctx.restore();
}

function renderDiagonalResizeControl(direction) {
  return function (ctx, left, top, styleOverride, fabricObject) {
    const size = this.sizeX || styleOverride?.cornerSize || fabricObject?.cornerSize || 22;
    ctx.save();
    ctx.translate(left, top);

    const angle = fabricObject?.getTotalAngle ? fabricObject.getTotalAngle() : (fabricObject?.angle || 0);
    if (angle) {
      ctx.rotate((angle * Math.PI) / 180);
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = Math.max(3, size * 0.16);
    ctx.shadowOffsetY = Math.max(1, size * 0.06);

    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.stroke();

    const d = size * 0.21;
    const arrow = size * 0.12;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (direction === 'nwse') {
      ctx.beginPath();
      ctx.moveTo(-d, -d);
      ctx.lineTo(d, d);
      ctx.moveTo(-d + arrow, -d);
      ctx.lineTo(-d, -d);
      ctx.lineTo(-d, -d + arrow);
      ctx.moveTo(d - arrow, d);
      ctx.lineTo(d, d);
      ctx.lineTo(d, d - arrow);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(d, -d);
      ctx.lineTo(-d, d);
      ctx.moveTo(d - arrow, -d);
      ctx.lineTo(d, -d);
      ctx.lineTo(d, -d + arrow);
      ctx.moveTo(-d + arrow, d);
      ctx.lineTo(-d, d);
      ctx.lineTo(-d, d - arrow);
      ctx.stroke();
    }

    ctx.restore();
  };
}

function renderEdgeResizeControl(orientation) {
  return function (ctx, left, top, styleOverride, fabricObject) {
    const size = this.sizeX || styleOverride?.cornerSize || fabricObject?.cornerSize || 18;
    ctx.save();
    ctx.translate(left, top);

    const angle = fabricObject?.getTotalAngle ? fabricObject.getTotalAngle() : (fabricObject?.angle || 0);
    if (angle) {
      ctx.rotate((angle * Math.PI) / 180);
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.26)';
    ctx.shadowBlur = Math.max(2.5, size * 0.15);
    ctx.shadowOffsetY = Math.max(1, size * 0.05);

    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.stroke();

    const d = size * 0.2;
    const arrow = size * 0.11;
    ctx.lineWidth = Math.max(1.5, size * 0.085);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (orientation === 'horizontal') {
      ctx.beginPath();
      ctx.moveTo(-d, 0);
      ctx.lineTo(d, 0);
      ctx.moveTo(-d + arrow, -arrow);
      ctx.lineTo(-d, 0);
      ctx.lineTo(-d + arrow, arrow);
      ctx.moveTo(d - arrow, -arrow);
      ctx.lineTo(d, 0);
      ctx.lineTo(d - arrow, arrow);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -d);
      ctx.lineTo(0, d);
      ctx.moveTo(-arrow, -d + arrow);
      ctx.lineTo(0, -d);
      ctx.lineTo(arrow, -d + arrow);
      ctx.moveTo(-arrow, d - arrow);
      ctx.lineTo(0, d);
      ctx.lineTo(arrow, d - arrow);
      ctx.stroke();
    }

    ctx.restore();
  };
}

FabricObject.ownDefaults.borderColor = '#0284c7';
FabricObject.ownDefaults.cornerColor = '#ffffff';
FabricObject.ownDefaults.cornerStrokeColor = '#0284c7';
FabricObject.ownDefaults.cornerStyle = 'circle';
FabricObject.ownDefaults.transparentCorners = false;
FabricObject.ownDefaults.lockScalingFlip = true;

if (FabricObject.ownDefaults.controls) {
  FabricObject.ownDefaults.controls.mtr.render = renderRotateControl;
  FabricObject.ownDefaults.controls.mtr.cursorStyle = 'grab';
  FabricObject.ownDefaults.controls.tl.render = renderDiagonalResizeControl('nwse');
  FabricObject.ownDefaults.controls.br.render = renderDiagonalResizeControl('nwse');
  FabricObject.ownDefaults.controls.tr.render = renderDiagonalResizeControl('nesw');
  FabricObject.ownDefaults.controls.bl.render = renderDiagonalResizeControl('nesw');
  FabricObject.ownDefaults.controls.ml.render = renderEdgeResizeControl('horizontal');
  FabricObject.ownDefaults.controls.mr.render = renderEdgeResizeControl('horizontal');
  FabricObject.ownDefaults.controls.mt.render = renderEdgeResizeControl('vertical');
  FabricObject.ownDefaults.controls.mb.render = renderEdgeResizeControl('vertical');
}

function applyControlMetrics(o, metrics) {
  o.cornerSize = metrics.cornerSize;
  o.borderScaleFactor = metrics.borderScaleFactor;
  if (o.controls) {
    if (o.controls.mtr) {
      o.controls.mtr.offsetY = metrics.rotateOffset;
      o.controls.mtr.sizeX = metrics.rotateSize;
      o.controls.mtr.sizeY = metrics.rotateSize;
    }
    if (o.controls.tl) {
      o.controls.tl.sizeX = o.controls.tl.sizeY = metrics.cornerSize;
      o.controls.tr.sizeX = o.controls.tr.sizeY = metrics.cornerSize;
      o.controls.bl.sizeX = o.controls.bl.sizeY = metrics.cornerSize;
      o.controls.br.sizeX = o.controls.br.sizeY = metrics.cornerSize;
    }
    if (o.controls.ml) {
      o.controls.ml.sizeX = o.controls.ml.sizeY = metrics.edgeSize;
      o.controls.mr.sizeX = o.controls.mr.sizeY = metrics.edgeSize;
      o.controls.mt.sizeX = o.controls.mt.sizeY = metrics.edgeSize;
      o.controls.mb.sizeX = o.controls.mb.sizeY = metrics.edgeSize;
    }
  }
}

export function LayerOverlay({ zoom, frame }) {
  const { base, setUi } = useEditor();
  const { layers, selected, select, previewUpdate, commit, update } = useLayerActions();
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const isInteractingRef = useRef(false);
  const isSyncingRef = useRef(false);

  const stateRef = useRef({ layers, selected, select, previewUpdate, commit, update, setUi });
  stateRef.current = { layers, selected, select, previewUpdate, commit, update, setUi };

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
      stopContextMenu: false,
      fireRightClick: false,
    });
    fabricRef.current = canvas;

    const onContextMenu = (e) => e.preventDefault();
    canvas.upperCanvasEl?.addEventListener('contextmenu', onContextMenu);

    canvas.on('selection:created', (e) => {
      if (isSyncingRef.current) return;
      const target = e.selected?.[0];
      if (target?.layerId) stateRef.current.select(target.layerId);
    });
    canvas.on('selection:updated', (e) => {
      if (isSyncingRef.current) return;
      const target = e.selected?.[0];
      if (target?.layerId) stateRef.current.select(target.layerId);
    });
    canvas.on('selection:cleared', () => {
      if (isSyncingRef.current) return;
      stateRef.current.select(null);
    });

    canvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj?.layerId) return;
      isInteractingRef.current = true;
      stateRef.current.previewUpdate(obj.layerId, { x: obj.left / W, y: obj.top / H });
    });

    canvas.on('object:rotating', (e) => {
      const obj = e.target;
      if (!obj?.layerId) return;
      isInteractingRef.current = true;
      stateRef.current.previewUpdate(obj.layerId, { rotation: Math.round(obj.angle % 360) });
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
        const orig = stateRef.current.layers.find((l) => l.id === obj.layerId);
        if (orig) patch.size = orig.size * scaleY;
      } else {
        patch.h = (obj.height * scaleY) / H;
      }

      obj.width *= scaleX;
      obj.height *= scaleY;
      obj.scaleX = 1;
      obj.scaleY = 1;

      stateRef.current.commit();
      stateRef.current.update(obj.layerId, patch);
      setTimeout(() => {
        isInteractingRef.current = false;
      }, 50);
    });

    canvas.on('mouse:dblclick', (e) => {
      if (e.target?.layerId) {
        stateRef.current.select(e.target.layerId);
        stateRef.current.setUi({ tool: 'layers' });
        if (e.target.layerType === 'text') {
          requestAnimationFrame(() => document.getElementById('layer-text')?.select());
        }
      }
    });

    return () => {
      canvas.upperCanvasEl?.removeEventListener('contextmenu', onContextMenu);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [base, W, H]);

  const getScaleMetrics = () => {
    const cssScale = frame?.width && W ? frame.width / W : 1;
    const screenScale = cssScale * (zoom || 1);
    const toCanvasPx = (screenPx) => Math.max(8, Math.round(screenPx / (screenScale || 1)));

    return {
      cornerSize: toCanvasPx(22),
      rotateSize: toCanvasPx(26),
      edgeSize: toCanvasPx(18),
      rotateOffset: -toCanvasPx(34),
      borderScaleFactor: Math.max(1, toCanvasPx(1.5)),
    };
  };

  useEffect(() => {
    if (fabricRef.current) {
      fabricRef.current.calcOffset();
      const metrics = getScaleMetrics();
      fabricRef.current.getObjects().forEach((o) => {
        applyControlMetrics(o, metrics);
      });
      fabricRef.current.requestRenderAll();
    }
  }, [zoom, frame?.width, frame?.height, W]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !base) return;
    if (isInteractingRef.current) return;

    isSyncingRef.current = true;
    try {
      canvas.remove(...canvas.getObjects());

      const metrics = getScaleMetrics();

      layers.forEach((layer) => {
        if (layer.hidden) return;

        let w = layer.w * W;
        let h = layer.h * H;
        if (layer.type === 'text') {
          const layout = layoutText(layer, W, H);
          h = layout.height;
        }

        const isLocked = Boolean(layer.locked);

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
          hasControls: !isLocked,
          hasBorders: !isLocked,
          selectable: !isLocked,
          evented: !isLocked,
          lockMovementX: isLocked,
          lockMovementY: isLocked,
          lockRotation: isLocked,
          lockScalingX: isLocked,
          lockScalingY: isLocked,
          cornerSize: metrics.cornerSize,
          borderScaleFactor: metrics.borderScaleFactor,
        });

        if (!isLocked) {
          applyControlMetrics(rect, metrics);
        }

        rect.layerId = layer.id;
        rect.layerType = layer.type;
        canvas.add(rect);

        if (!isLocked && selected && selected.id === layer.id) {
          canvas.setActiveObject(rect);
        }
      });

      canvas.requestRenderAll();
    } finally {
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 0);
    }
  }, [layers, base, selected?.id, W, H, zoom, frame?.width, frame?.height]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || isSyncingRef.current) return;
    const active = canvas.getActiveObject();
    if (selected) {
      if (active?.layerId !== selected.id) {
        const match = canvas.getObjects().find((o) => o.layerId === selected.id);
        if (match && match.selectable) {
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
