/**
 * Panel for adding, reordering, styling, and managing document layers.
 */

import { useRef } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bold,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Lock,
  Minus,
  PaintBucket,
  ScanFace,
  Square,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { BLEND_MODES, FONTS } from '../../engine/layers.js';
import { ACCEPT_ATTR, firstImageFile } from '../../lib/image.js';
import { useToast } from '../../components/Toaster.jsx';
import { Panel, cx } from '../../components/ui.jsx';
import { ColorField, RangeField, ToggleRow } from '../../components/fields.jsx';
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useLayerActions } from './useLayerActions.js';

const TYPE_ICONS = { text: Type, image: ImagePlus, subject: ScanFace };
const SHAPE_ICONS = { rect: Square, ellipse: Circle, line: Minus, arrow: ArrowRight };
const iconFor = (layer) => (layer.type === 'shape' ? SHAPE_ICONS[layer.shape] : (TYPE_ICONS[layer.type] || Type));

const pct = (v) => `${Math.round(v * 100)}%`;

function AddButton({ label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="hairline flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink-700 text-[11px] font-bold hover:bg-ink-600"
    >
      <Icon className="size-4" />
    </button>
  );
}

export function LayersPanel() {
  const toast = useToast();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { layers, selected, select, addText, addShape, addImage, remove, duplicate, reorder, update, previewUpdate, commit } = useLayerActions();
  const fileRef = useRef(null);

  const onImage = async (file) => {
    try {
      await addImage(file);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const live = (patch) => previewUpdate(selected.id, patch);
  const set = (patch) => update(selected.id, patch);

  return (
    <Panel className="scrollbar-none flex min-h-0 flex-col overflow-y-auto p-5">
      <h2 className="text-[19px] font-bold tracking-tight">Layers</h2>
      <p className="mt-1 text-[12px] text-white/45">Text, shapes and photos on top of your edit.</p>

      <div className="mt-5 flex gap-2">
        <AddButton label="Add text (T)" icon={Type} onClick={addText} />
        <AddButton label="Add rectangle" icon={Square} onClick={() => addShape('rect')} />
        <AddButton label="Add ellipse" icon={Circle} onClick={() => addShape('ellipse')} />
        <AddButton label="Add arrow" icon={ArrowRight} onClick={() => addShape('arrow')} />
        <AddButton label="Add line" icon={Minus} onClick={() => addShape('line')} />
        <AddButton label="Add photo or logo" icon={ImagePlus} onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            const file = firstImageFile(e.target.files);
            if (file) onImage(file);
            e.target.value = '';
          }}
        />
      </div>

      {!desktop && (
        <>
          {layers.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[12px] leading-relaxed text-white/40">
              No layers yet. Add text, a shape or a photo.
            </p>
          ) : (
            <ul className="mt-5 space-y-1" aria-label="Layers, top first">
              {[...layers].reverse().map((layer) => {
                const Icon = iconFor(layer);
                const isSelected = selected?.id === layer.id;
                const index = layers.indexOf(layer);
                return (
                  <li key={layer.id}>
                    <div
                      className={cx(
                        'group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors',
                        isSelected ? 'bg-ink-700 ring-1 ring-sky/60' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <button type="button" onClick={() => select(layer.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Icon className={cx('size-4 shrink-0', layer.hidden ? 'text-white/25' : 'text-white/70')} />
                        <span className={cx('truncate text-[12px] font-semibold', layer.hidden && 'text-white/35')}>
                          {layer.type === 'text' ? layer.text.split('\n')[0] || 'Text' : layer.name}
                        </span>
                        {layer.locked && <Lock className="size-3 text-amber-400 shrink-0 ml-1" title="Locked" />}
                      </button>
                      <div className={cx('flex shrink-0 gap-0.5', !isSelected && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}>
                        <IconAction
                          label={layer.locked ? 'Unlock' : 'Lock'}
                          onClick={() => {
                            const nextLocked = !layer.locked;
                            update(layer.id, { locked: nextLocked });
                            if (nextLocked && selected?.id === layer.id) select(null);
                          }}
                          icon={layer.locked ? Lock : Unlock}
                        />
                        <IconAction label="Bring forward" disabled={index === layers.length - 1} onClick={() => reorder(layer.id, 1)} icon={ArrowUp} />
                        <IconAction label="Send backward" disabled={index === 0} onClick={() => reorder(layer.id, -1)} icon={ArrowDown} />
                        <IconAction label="Duplicate" onClick={() => duplicate(layer.id)} icon={Copy} />
                        <IconAction label="Delete" onClick={() => remove(layer.id)} icon={Trash2} />
                      </div>
                      <IconAction
                        label={layer.hidden ? 'Show' : 'Hide'}
                        onClick={() => update(layer.id, { hidden: !layer.hidden })}
                        icon={layer.hidden ? EyeOff : Eye}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {selected ? (
        <section className="mt-5 space-y-4 border-t border-white/5 pt-5" aria-label="Layer properties">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="hairline grid size-7 place-items-center rounded-lg bg-ink-700 text-sky">
                {(() => {
                  const Icon = iconFor(selected);
                  return <Icon className="size-4" />;
                })()}
              </span>
              <span className="truncate text-[13px] font-bold text-white">
                {selected.type === 'text' ? (selected.text.split('\n')[0] || 'Text') : selected.name}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const nextLocked = !selected.locked;
                  set({ locked: nextLocked });
                  if (nextLocked) select(null);
                }}
                className={cx(
                  'flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition',
                  selected.locked ? 'bg-amber-400/20 text-amber-400 ring-1 ring-amber-400/40' : 'bg-ink-700 text-white/70 hover:bg-ink-600 hover:text-white',
                )}
                title={selected.locked ? 'Unlock layer' : 'Lock layer (make non-selectable on canvas)'}
              >
                {selected.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                {selected.locked ? 'Locked' : 'Lock'}
              </button>
              <button
                type="button"
                onClick={() => set({ hidden: !selected.hidden })}
                className="grid size-7 place-items-center rounded-lg bg-ink-700 text-white/70 hover:bg-ink-600 hover:text-white"
                title={selected.hidden ? 'Show layer' : 'Hide layer'}
              >
                {selected.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => duplicate(selected.id)}
                className="grid size-7 place-items-center rounded-lg bg-ink-700 text-white/70 hover:bg-ink-600 hover:text-white"
                title="Duplicate layer"
              >
                <Copy className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(selected.id)}
                className="grid size-7 place-items-center rounded-lg bg-ink-700 text-rec hover:bg-rec/20"
                title="Delete layer"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {selected.type === 'text' && <TextProperties layer={selected} live={live} set={set} commit={commit} />}
          {selected.type === 'shape' && <ShapeProperties layer={selected} live={live} set={set} commit={commit} />}

          <RangeField label="Opacity" value={selected.opacity} min={0} max={1} step={0.01} format={pct} onChange={(opacity) => live({ opacity })} onCommit={commit} />
          <RangeField
            label="Rotation"
            value={selected.rotation}
            min={-180}
            max={180}
            step={1}
            format={(v) => `${v}°`}
            onChange={(rotation) => live({ rotation })}
            onCommit={commit}
          />
          <label className="block">
            <span className="text-[12px] font-semibold text-white/70">Blend</span>
            <select
              value={selected.blend}
              onChange={(e) => set({ blend: e.target.value })}
              className="mt-1.5 h-9 w-full rounded-xl bg-ink-950 px-3 text-base font-semibold ring-1 lg:text-[12px] ring-white/10 outline-none focus:ring-sky"
            >
              {BLEND_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : desktop ? (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/40">
          <p className="text-[13px] font-semibold text-white/60">No layer selected</p>
          <p className="mt-1.5 text-[11px] leading-relaxed">
            Select a layer from the Layer Stack in the bottom right, or click an element on the canvas to edit.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function IconAction({ label, icon: Icon, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-lg text-white/55 hover:bg-white/5 hover:text-white disabled:opacity-25"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function TextProperties({ layer, live, set, commit }) {
  const font = FONTS.find((f) => f.key === layer.font) ?? FONTS[0];
  const bold = layer.weight >= 700;

  return (
    <>
      <label className="block">
        <span className="text-[12px] font-semibold text-white/70">Text</span>
        <textarea
          id="layer-text"
          rows={2}
          value={layer.text}
          onChange={(e) => live({ text: e.target.value })}
          onBlur={commit}
          className="mt-1.5 w-full resize-y rounded-xl bg-ink-950 px-3 py-2 text-base ring-1 lg:text-[13px] ring-white/10 outline-none focus:ring-sky"
        />
      </label>

      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Font">
        {FONTS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={layer.font === f.key}
            onClick={() => set({ font: f.key })}
            title={f.label}
            className={cx(
              'h-10 rounded-xl text-[15px] transition-colors',
              layer.font === f.key ? 'bg-white text-ink-950' : 'bg-ink-700 text-white/75 hover:text-white',
            )}
            style={{ fontFamily: `"${f.family}"` }}
          >
            Aa
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <ToggleRow
          label="Alignment"
          value={layer.align}
          onChange={(align) => set({ align })}
          options={[
            { value: 'left', icon: AlignLeft, title: 'Align left' },
            { value: 'center', icon: AlignCenter, title: 'Centre' },
            { value: 'right', icon: AlignRight, title: 'Align right' },
          ]}
        />
        <div className="flex rounded-xl bg-ink-950 p-1">
          <StyleToggle label="Bold" icon={Bold} active={bold} disabled={font.weights.length === 1} onClick={() => set({ weight: bold ? 400 : 800 })} />
          <StyleToggle label="Italic" icon={Italic} active={layer.italic} onClick={() => set({ italic: !layer.italic })} />
        </div>
      </div>

      <RangeField label="Size" value={layer.size} min={0.02} max={0.3} step={0.002} format={(v) => `${(v * 100).toFixed(1)}%`} onChange={(size) => live({ size })} onCommit={commit} />
      <RangeField label="Letter spacing" value={layer.letterSpacing} min={-0.05} max={0.4} step={0.01} format={(v) => v.toFixed(2)} onChange={(letterSpacing) => live({ letterSpacing })} onCommit={commit} />
      <ColorField label="Colour" value={layer.color} onChange={(color) => set({ color })} onLive={(color) => live({ color })} onCommit={commit} />
      <RangeField label="Outline" value={layer.strokeWidth} min={0} max={0.15} step={0.005} format={pct} onChange={(strokeWidth) => live({ strokeWidth })} onCommit={commit} />
      {layer.strokeWidth > 0 && <ColorField label="Outline colour" value={layer.strokeColor} onChange={(strokeColor) => set({ strokeColor })} onLive={(strokeColor) => live({ strokeColor })} onCommit={commit} />}
      <label className="flex items-center justify-between text-[12px] font-semibold text-white/70">
        Drop shadow
        <input type="checkbox" checked={layer.shadow} onChange={(e) => set({ shadow: e.target.checked })} className="size-4 accent-[var(--color-sky)]" />
      </label>
    </>
  );
}

function StyleToggle({ label, icon: Icon, active, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx('grid h-8 w-9 place-items-center rounded-lg disabled:opacity-30', active ? 'bg-ink-700 text-white' : 'text-white/45 hover:text-white')}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function ShapeProperties({ layer, live, set, commit }) {
  const { assets } = useEditor();
  const toast = useToast();
  const fileRef = useRef(null);
  const linear = layer.shape === 'line' || layer.shape === 'arrow';
  const shapeAsset = layer.assetId ? (assets?.map?.get ? assets.map.get(layer.assetId) : null) : null;
  const fillType = layer.fillType || (layer.assetId ? 'image' : 'color');

  const onChooseImage = async (file) => {
    try {
      const asset = await assets.add(file);
      set({ fillType: 'image', assetId: asset.id });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      {!linear && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-white/70">Fill</span>
            <div className="flex rounded-xl bg-ink-950 p-1">
              <button
                type="button"
                onClick={() => set({ fillType: 'color' })}
                className={cx(
                  'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                  fillType === 'color' ? 'bg-ink-700 text-white shadow-sm' : 'text-white/45 hover:text-white',
                )}
              >
                <PaintBucket className="size-3" />
                Colour
              </button>
              <button
                type="button"
                onClick={() => {
                  set({ fillType: 'image' });
                  if (!shapeAsset) fileRef.current?.click();
                }}
                className={cx(
                  'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                  fillType === 'image' ? 'bg-ink-700 text-white shadow-sm' : 'text-white/45 hover:text-white',
                )}
              >
                <ImageIcon className="size-3" />
                Photo
              </button>
            </div>
          </div>

          {fillType === 'color' ? (
            <ColorField
              label="Fill colour"
              value={layer.fill}
              allowNone
              onChange={(fill) => set({ fill })}
              onLive={(fill) => live({ fill })}
              onCommit={commit}
            />
          ) : (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                hidden
                onChange={(e) => {
                  const file = firstImageFile(e.target.files);
                  if (file) onChooseImage(file);
                  e.target.value = '';
                }}
              />
              {shapeAsset ? (
                <div className="flex items-center gap-3 rounded-xl bg-ink-950 p-2.5 ring-1 ring-white/10">
                  <img
                    src={shapeAsset.url}
                    alt=""
                    className="hairline size-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-white">{shapeAsset.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="text-[11px] font-bold text-sky hover:underline"
                      >
                        Change photo
                      </button>
                      <span className="text-[11px] text-white/30">•</span>
                      <button
                        type="button"
                        onClick={() => set({ assetId: null, fillType: 'color' })}
                        className="text-[11px] font-bold text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-ink-950 text-[12px] font-bold text-white/80 hover:border-sky/50 hover:bg-ink-900 hover:text-white transition"
                >
                  <ImageIcon className="size-4 text-sky" />
                  Choose photo to fill shape
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ColorField
        label={linear ? 'Colour' : 'Outline'}
        value={layer.stroke}
        allowNone={!linear}
        onChange={(stroke) => set({ stroke })}
        onLive={(stroke) => live({ stroke })}
        onCommit={commit}
      />
      <RangeField
        label={linear ? 'Thickness' : 'Outline width'}
        value={layer.strokeWidth}
        min={0}
        max={0.05}
        step={0.001}
        format={(v) => `${(v * 100).toFixed(1)}%`}
        onChange={(strokeWidth) => live({ strokeWidth })}
        onCommit={commit}
      />
      {layer.shape === 'rect' && (
        <RangeField label="Corner radius" value={layer.radius} min={0} max={0.5} step={0.01} format={pct} onChange={(radius) => live({ radius })} onCommit={commit} />
      )}
    </>
  );
}
