import { ADJUSTMENT_KEYS, defaultAdjustments } from '@editmate/shared';
import { defaultGeometry } from '../engine/geometry.js';
import { defaultBackground } from '../engine/layers.js';

/**
 * Undoable edit document: { adjustments, geometry, background, layers }.
 *
 * `present` changes on every slider tick; `committed` only when a gesture ends.
 * Undo steps therefore map to user actions, not to individual input events.
 */
const LIMIT = 100;

export const emptyDocument = () => ({
  adjustments: defaultAdjustments(),
  geometry: defaultGeometry(),
  background: defaultBackground(),
  layers: [],
});

export const initialHistory = (doc = emptyDocument()) => ({ past: [], present: doc, committed: doc, future: [] });

function sameGeometry(a, b) {
  if (a === b) return true;
  if (a.quarterTurns !== b.quarterTurns || a.straighten !== b.straighten || a.flipH !== b.flipH) return false;
  if (a.crop === b.crop) return true;
  if (!a.crop || !b.crop) return false;
  return ['x', 'y', 'width', 'height'].every((k) => Math.abs(a.crop[k] - b.crop[k]) < 1e-6);
}

/** Layers and background are small plain objects; structural equality is cheap enough. */
const sameJson = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function sameDocument(a, b) {
  return (
    ADJUSTMENT_KEYS.every((k) => a.adjustments[k] === b.adjustments[k]) &&
    sameGeometry(a.geometry, b.geometry) &&
    sameJson(a.background, b.background) &&
    sameJson(a.layers, b.layers)
  );
}

function commit(state) {
  if (sameDocument(state.present, state.committed)) return state;
  return {
    past: [...state.past, state.committed].slice(-LIMIT),
    present: state.present,
    committed: state.present,
    future: [],
  };
}

/** Objects merge shallowly; `layers` is replaced as a whole array. */
function merge(doc, patch) {
  return {
    adjustments: patch.adjustments ? { ...doc.adjustments, ...patch.adjustments } : doc.adjustments,
    geometry: patch.geometry ? { ...doc.geometry, ...patch.geometry } : doc.geometry,
    background: patch.background ? { ...doc.background, ...patch.background } : doc.background,
    layers: patch.layers ?? doc.layers,
  };
}

/**
 * Actions:
 *   preview { patch }   live change, not yet an undo step
 *   commit              close the current gesture
 *   apply   { patch }   preview + commit in one go (buttons, presets)
 *   undo / redo
 *   load    { doc? }    fresh history (new image)
 */
export function historyReducer(state, action) {
  switch (action.type) {
    case 'preview':
      return { ...state, present: merge(state.present, action.patch) };
    case 'commit':
      return commit(state);
    case 'apply':
      return commit({ ...state, present: merge(state.present, action.patch) });
    case 'undo': {
      const settled = commit(state);
      if (!settled.past.length) return settled;
      const previous = settled.past[settled.past.length - 1];
      return {
        past: settled.past.slice(0, -1),
        present: previous,
        committed: previous,
        future: [settled.committed, ...settled.future],
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.committed], present: next, committed: next, future: rest };
    }
    case 'load':
      return initialHistory(action.doc);
    default:
      throw new Error(`Unknown history action: ${action.type}`);
  }
}
