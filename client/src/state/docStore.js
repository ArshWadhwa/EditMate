import { create } from 'zustand';
import { defaultAdjustments } from '@editmate/shared';
import { defaultGeometry } from '../engine/geometry.js';
import { defaultBackground } from '../engine/layers.js';

/**
 * Initializes a new document structure with default parameters.
 *
 * @returns {object} Document state
 */
export const emptyDocument = () => ({
  adjustments: defaultAdjustments(),
  geometry: defaultGeometry(),
  background: defaultBackground(),
  layers: [],
});

/**
 * Immutably merges partial document patches into an existing document object.
 *
 * @param {object} doc - Existing document state
 * @param {object} patch - Partial document updates
 * @returns {object} Updated document
 */
export function mergeDocument(doc, patch) {
  return {
    adjustments: patch.adjustments ? { ...doc.adjustments, ...patch.adjustments } : doc.adjustments,
    geometry: patch.geometry ? { ...doc.geometry, ...patch.geometry } : doc.geometry,
    background: patch.background ? { ...doc.background, ...patch.background } : doc.background,
    layers: patch.layers ?? doc.layers,
  };
}

/**
 * Global Zustand store managing document state, live previews, and gesture undo/redo history.
 */
export const useDocStore = create((set, get) => ({
  doc: emptyDocument(),
  committed: emptyDocument(),
  past: [],
  future: [],

  /**
   * Applies uncommitted preview updates during an active slider/pointer drag gesture.
   */
  preview: (patch) =>
    set((s) => ({ doc: mergeDocument(s.doc, patch) })),

  /**
   * Commits the current gesture state into the undo history stack.
   */
  commit: () =>
    set((s) => {
      if (JSON.stringify(s.doc) === JSON.stringify(s.committed)) return s;
      return {
        past: [...s.past, s.committed].slice(-100),
        committed: s.doc,
        future: [],
      };
    }),

  /**
   * Atomically commits a discrete action (e.g. presets, reset buttons).
   */
  apply: (patch) => {
    const nextDoc = mergeDocument(get().doc, patch);
    set((s) => ({
      past: [...s.past, s.committed].slice(-100),
      doc: nextDoc,
      committed: nextDoc,
      future: [],
    }));
  },

  /**
   * Reverts the document to the previous committed state in history.
   */
  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        doc: prev,
        committed: prev,
        future: [s.committed, ...s.future],
      };
    }),

  /**
   * Re-applies the next state from the redo stack.
   */
  redo: () =>
    set((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return {
        past: [...s.past, s.committed],
        doc: next,
        committed: next,
        future: rest,
      };
    }),

  /**
   * Resets document state and purges undo/redo history stacks.
   */
  reset: (doc = emptyDocument()) =>
    set({ doc, committed: doc, past: [], future: [] }),
}));
