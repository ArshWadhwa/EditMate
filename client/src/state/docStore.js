/**
 * Zustand store managing document state, undo/redo history, and UI tool selection.
 */

import { create } from 'zustand';
import { defaultAdjustments } from '@editmate/shared';
import { defaultGeometry } from '../engine/geometry.js';
import { defaultBackground } from '../engine/layers.js';

export const emptyDocument = () => ({
  adjustments: defaultAdjustments(),
  geometry: defaultGeometry(),
  background: defaultBackground(),
  layers: [],
});

export function mergeDocument(doc, patch) {
  return {
    adjustments: patch.adjustments ? { ...doc.adjustments, ...patch.adjustments } : doc.adjustments,
    geometry: patch.geometry ? { ...doc.geometry, ...patch.geometry } : doc.geometry,
    background: patch.background ? { ...doc.background, ...patch.background } : doc.background,
    layers: patch.layers ?? doc.layers,
  };
}

export const useDocStore = create((set, get) => ({
  doc: emptyDocument(),
  committed: emptyDocument(),
  past: [],
  future: [],

  preview: (patch) =>
    set((s) => ({ doc: mergeDocument(s.doc, patch) })),

  commit: () =>
    set((s) => {
      if (JSON.stringify(s.doc) === JSON.stringify(s.committed)) return s;
      return {
        past: [...s.past, s.committed].slice(-100),
        committed: s.doc,
        future: [],
      };
    }),

  apply: (patch) => {
    const nextDoc = mergeDocument(get().doc, patch);
    set((s) => ({
      past: [...s.past, s.committed].slice(-100),
      doc: nextDoc,
      committed: nextDoc,
      future: [],
    }));
  },

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

  reset: (doc = emptyDocument()) =>
    set({ doc, committed: doc, past: [], future: [] }),
}));
