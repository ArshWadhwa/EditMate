/**
 * Circular rotary control pad for fine adjustment tweaking across tools.
 */

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { ADJUSTMENTS, clampAdjustment, getAdjustment } from '@editmate/shared';
import { useEditor } from '../../state/EditorProvider.jsx';
import { useCrop } from '../crop/CropProvider.jsx';
import { useLayerActions } from '../layers/useLayerActions.js';
import { signed, signedFixed } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';

function useHoldRepeat() {
  const timer = useRef(null);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  return (fn, onEnd) => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      let delay = 380;
      const tick = () => {
        fn();
        delay = Math.max(40, delay * 0.8);
        timer.current = setTimeout(tick, delay);
      };
      fn();
      timer.current = setTimeout(tick, delay);
    },
    onPointerUp: () => {
      stop();
      onEnd?.();
    },
    onPointerCancel: () => {
      stop();
      onEnd?.();
    },
  });
}

const CROP_ASPECTS = ['free', 'original', '1:1', '4:5', '3:2', '16:9', 'custom'];
const BG_MODES = ['transparent', 'color', 'image', 'blur'];

export function useFocusNavigation() {
  const { ui, setUi, adjustments, geometry, background, subject, preview, commit, apply } = useEditor();
  const crop = useCrop();
  const layerActions = useLayerActions();

  const latestAdjustments = useRef(adjustments);
  latestAdjustments.current = adjustments;
  const latestGeometry = useRef(geometry);
  latestGeometry.current = geometry;
  const latestBackground = useRef(background);
  latestBackground.current = background;
  const latestLayers = useRef(layerActions.layers);
  latestLayers.current = layerActions.layers;

  const tool = ui.tool || 'adjust';

  // --- Adjust Tab ---
  const groupAdjustments = ADJUSTMENTS.filter((a) => a.group === (ui.group || 'light'));
  const activeGroup = groupAdjustments.length > 0 ? groupAdjustments : ADJUSTMENTS;
  const adjustIndex = activeGroup.findIndex((a) => a.key === ui.focusedKey);
  const currentAdjust = activeGroup[adjustIndex >= 0 ? adjustIndex : 0] || ADJUSTMENTS[0];

  const moveAdjust = (direction) => {
    const next = activeGroup[(adjustIndex + direction + activeGroup.length) % activeGroup.length];
    setUi({ focusedKey: next.key, group: next.group, tool: 'adjust' });
  };

  const nudgeAdjust = (amount) => {
    const key = currentAdjust.key;
    preview({ adjustments: { [key]: clampAdjustment(key, latestAdjustments.current[key] + amount) } });
  };

  // --- Crop Tab ---
  const moveCrop = (direction) => {
    const currentIndex = CROP_ASPECTS.indexOf(crop.aspectKey);
    const nextAspect = CROP_ASPECTS[(currentIndex + direction + CROP_ASPECTS.length) % CROP_ASPECTS.length];
    crop.setAspect(nextAspect);
  };

  const nudgeCrop = (amount) => {
    if (crop.aspectKey === 'custom') {
      crop.setCustom({ w: Math.max(1, Math.min(100, crop.custom.w + amount)) });
    } else {
      const next = Math.max(-180, Math.min(180, Math.round((latestGeometry.current.straighten + amount * 0.5) * 10) / 10));
      preview({ geometry: { straighten: next, crop: null } });
    }
  };

  // --- Background Tab ---
  const moveBackground = (direction) => {
    const currentIndex = BG_MODES.indexOf(latestBackground.current.mode);
    const nextMode = BG_MODES[(currentIndex + direction + BG_MODES.length) % BG_MODES.length];
    if (nextMode === 'image' && !latestBackground.current.assetId) {
      apply({ background: { mode: nextMode } });
    } else {
      subject.ensureMask().then((mask) => {
        if (mask) apply({ background: { mode: nextMode } });
      });
    }
  };

  const nudgeBackground = (amount) => {
    const mode = latestBackground.current.mode;
    if (mode === 'blur') {
      const next = Math.max(5, Math.min(100, (latestBackground.current.blur ?? 40) + amount * 2));
      preview({ background: { blur: next } });
    } else if (mode === 'image') {
      const next = Math.max(0, Math.min(100, (latestBackground.current.imageBlur ?? 0) + amount * 2));
      preview({ background: { imageBlur: next, blur: next } });
    }
  };

  // --- Layers Tab ---
  const moveLayers = (direction) => {
    const list = latestLayers.current;
    if (!list.length) return;
    const currentIdx = list.findIndex((l) => l.id === layerActions.selected?.id);
    const nextIdx = (currentIdx + direction + list.length) % list.length;
    layerActions.select(list[nextIdx].id);
  };

  const nudgeLayers = (amount) => {
    const sel = layerActions.selected;
    if (!sel) return;
    const nextOpacity = Math.max(0, Math.min(1, Math.round(((sel.opacity ?? 1) + amount * 0.05) * 100) / 100));
    layerActions.previewUpdate(sel.id, { opacity: nextOpacity });
  };

  const move = (direction) => {
    if (tool === 'crop') moveCrop(direction);
    else if (tool === 'background') moveBackground(direction);
    else if (tool === 'layers') moveLayers(direction);
    else moveAdjust(direction);
  };

  const nudge = (amount) => {
    if (tool === 'crop') nudgeCrop(amount);
    else if (tool === 'background') nudgeBackground(amount);
    else if (tool === 'layers') nudgeLayers(amount);
    else nudgeAdjust(amount);
  };

  // --- Compute Label & Value for Center Display ---
  let label = currentAdjust.label;
  let valueDisplay = signed(adjustments[currentAdjust.key]);
  let activeValue = Boolean(adjustments[currentAdjust.key]);

  if (tool === 'crop') {
    label = crop.aspectKey === 'custom' ? `Custom ${crop.custom.w}:${crop.custom.h}` : `Aspect ${crop.aspectKey}`;
    valueDisplay = geometry.straighten !== 0 ? `${signedFixed(geometry.straighten)}°` : crop.aspectKey.toUpperCase();
    activeValue = geometry.straighten !== 0 || crop.aspectKey !== 'free';
  } else if (tool === 'background') {
    if (background.mode === 'blur') {
      label = 'Blur Amount';
      valueDisplay = `${background.blur ?? 40}%`;
      activeValue = true;
    } else if (background.mode === 'image') {
      label = 'Photo Blur';
      valueDisplay = `${background.imageBlur ?? 0}%`;
      activeValue = (background.imageBlur ?? 0) > 0;
    } else {
      label = 'Bg Mode';
      valueDisplay = background.mode.toUpperCase();
      activeValue = background.mode !== 'original';
    }
  } else if (tool === 'layers') {
    const sel = layerActions.selected;
    if (sel) {
      label = sel.type === 'text' ? (sel.text.split('\n')[0].slice(0, 8) || 'Text') : sel.name;
      valueDisplay = `${Math.round((sel.opacity ?? 1) * 100)}%`;
      activeValue = (sel.opacity ?? 1) < 1;
    } else {
      label = 'Layers';
      valueDisplay = `${layerActions.layers.length} active`;
      activeValue = layerActions.layers.length > 0;
    }
  }

  return {
    move,
    nudge,
    commit,
    label,
    valueDisplay,
    activeValue,
    focused: currentAdjust,
  };
}

export function ControlPad({ disabled }) {
  const { move, nudge, commit, label, valueDisplay, activeValue } = useFocusNavigation();
  const hold = useHoldRepeat();

  const arrow =
    'absolute grid size-9 place-items-center rounded-full text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-30';

  return (
    <div className="flex w-[160px] shrink-0 flex-col items-center justify-center">
      <div className="hairline relative size-[150px] rounded-full bg-ink-700" role="group" aria-label={`Nudge ${label}`}>
        <button
          type="button"
          disabled={disabled}
          aria-label="Previous property"
          className={cx(arrow, 'top-1 left-1/2 -translate-x-1/2')}
          onClick={() => move(-1)}
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Next property"
          className={cx(arrow, 'bottom-1 left-1/2 -translate-x-1/2')}
          onClick={() => move(1)}
        >
          <ChevronDown className="size-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          className={cx(arrow, 'top-1/2 left-1 -translate-y-1/2')}
          {...hold(() => nudge(-1), commit)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Increase ${label}`}
          className={cx(arrow, 'top-1/2 right-1 -translate-y-1/2')}
          {...hold(() => nudge(1), commit)}
        >
          <ChevronRight className="size-4" />
        </button>

        <div className="absolute inset-[34px] flex flex-col items-center justify-center gap-0.5 rounded-full bg-ink-900 px-2 shadow-inner">
          <span className="max-w-full truncate text-[9px] font-semibold tracking-wide text-white/45 text-center">{label}</span>
          <span
            className={cx('num max-w-full truncate px-1 text-center text-[13px] font-medium leading-none', activeValue ? 'text-accent' : 'text-white/60')}
            aria-live="polite"
          >
            {valueDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}
