/**
 * Hook providing layer mutation actions like add, remove, reorder, and duplicate.
 */

import { useCallback, useMemo } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { createImageLayer, createShapeLayer, createTextLayer, duplicateLayer } from '../../engine/layers.js';

export function useLayerActions() {
  const { layers, ui, setUi, preview, commit, apply, assets, base } = useEditor();
  const selected = layers.find((l) => l.id === ui.selectedLayerId) ?? null;

  const select = useCallback((id) => setUi({ selectedLayerId: id }), [setUi]);

  const replace = useCallback((id, patch) => layers.map((l) => (l.id === id ? { ...l, ...patch } : l)), [layers]);

  const actions = useMemo(
    () => ({
      select,
      previewUpdate: (id, patch) => preview({ layers: replace(id, patch) }),
      commit,
      update: (id, patch) => apply({ layers: replace(id, patch) }),

      add: (layer) => {
        apply({ layers: [...layers, layer] });
        setUi({ selectedLayerId: layer.id, tool: 'layers' });
      },
      addText: () => actions.add(createTextLayer()),
      addShape: (shape) => actions.add(createShapeLayer(shape)),
      addImage: async (file) => {
        const asset = await assets.add(file);
        const outputAspect = base ? base.width / base.height : 1;
        actions.add(createImageLayer(asset.id, asset.name.replace(/\.[^.]+$/, ''), asset.width / asset.height, outputAspect));
      },

      remove: (id) => {
        apply({ layers: layers.filter((l) => l.id !== id) });
        if (ui.selectedLayerId === id) setUi({ selectedLayerId: null });
      },
      duplicate: (id) => {
        const index = layers.findIndex((l) => l.id === id);
        if (index < 0) return;
        const copy = duplicateLayer(layers[index]);
        apply({ layers: [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)] });
        setUi({ selectedLayerId: copy.id });
      },
      reorder: (id, direction) => {
        const index = layers.findIndex((l) => l.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= layers.length) return;
        const next = layers.slice();
        [next[index], next[target]] = [next[target], next[index]];
        apply({ layers: next });
      },
      nudge: (id, dx, dy) => {
        const layer = layers.find((l) => l.id === id);
        if (layer) apply({ layers: replace(id, { x: layer.x + dx, y: layer.y + dy }) });
      },
    }),
    [select, preview, replace, commit, apply, layers, setUi, assets, base, ui.selectedLayerId],
  );

  return { layers, selected, ...actions };
}
