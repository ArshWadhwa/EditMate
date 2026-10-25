/**
 * Hook providing layer mutation actions like add, remove, reorder, and duplicate.
 */

import { useCallback } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { useDocStore } from '../../state/docStore.js';
import { createImageLayer, createShapeLayer, createTextLayer, duplicateLayer } from '../../engine/layers.js';

export function useLayerActions() {
  const { layers, ui, setUi, preview, commit, apply, assets, base } = useEditor();
  const selected = layers.find((l) => l.id === ui.selectedLayerId) ?? null;

  const getLatestLayers = () => useDocStore.getState().doc.layers;

  const select = useCallback((id) => setUi({ selectedLayerId: id }), [setUi]);

  const replace = useCallback((id, patch) => {
    const currentLayers = getLatestLayers();
    return currentLayers.map((l) => (l.id === id ? { ...l, ...patch } : l));
  }, []);

  const add = useCallback(
    (layer) => {
      const currentLayers = getLatestLayers();
      apply({ layers: [...currentLayers, layer] });
      setUi({ selectedLayerId: layer.id, tool: 'layers' });
    },
    [apply, setUi],
  );

  const addText = useCallback(() => add(createTextLayer()), [add]);
  const addShape = useCallback((shape) => add(createShapeLayer(shape)), [add]);
  const addImage = useCallback(
    async (file) => {
      const asset = await assets.add(file);
      const outputAspect = base ? base.width / base.height : 1;
      add(createImageLayer(asset.id, asset.name.replace(/\.[^.]+$/, ''), asset.width / asset.height, outputAspect));
    },
    [assets, base, add],
  );

  const remove = useCallback(
    (id) => {
      const currentLayers = getLatestLayers();
      apply({ layers: currentLayers.filter((l) => l.id !== id) });
      if (ui.selectedLayerId === id) setUi({ selectedLayerId: null });
    },
    [apply, setUi, ui.selectedLayerId],
  );

  const duplicate = useCallback(
    (id) => {
      const currentLayers = getLatestLayers();
      const index = currentLayers.findIndex((l) => l.id === id);
      if (index < 0) return;
      const copy = duplicateLayer(currentLayers[index]);
      apply({ layers: [...currentLayers.slice(0, index + 1), copy, ...currentLayers.slice(index + 1)] });
      setUi({ selectedLayerId: copy.id });
    },
    [apply, setUi],
  );

  const reorder = useCallback(
    (id, direction) => {
      const currentLayers = getLatestLayers();
      const index = currentLayers.findIndex((l) => l.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= currentLayers.length) return;
      const next = currentLayers.slice();
      [next[index], next[target]] = [next[target], next[index]];
      apply({ layers: next });
    },
    [apply],
  );

  const nudge = useCallback(
    (id, dx, dy) => {
      const currentLayers = getLatestLayers();
      const layer = currentLayers.find((l) => l.id === id);
      if (layer) apply({ layers: replace(id, { x: layer.x + dx, y: layer.y + dy }) });
    },
    [apply, replace],
  );

  const previewUpdate = useCallback(
    (id, patch) => {
      preview({ layers: replace(id, patch) });
    },
    [preview, replace],
  );

  const update = useCallback(
    (id, patch) => {
      apply({ layers: replace(id, patch) });
    },
    [apply, replace],
  );

  return {
    layers,
    selected,
    select,
    previewUpdate,
    commit,
    update,
    add,
    addText,
    addShape,
    addImage,
    remove,
    duplicate,
    reorder,
    nudge,
  };
}
