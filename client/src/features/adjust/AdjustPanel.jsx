import { useCallback } from 'react';
import { BookmarkPlus, Pipette, RotateCcw } from 'lucide-react';
import { ADJUSTMENTS, ADJUSTMENT_GROUPS } from '@editmate/shared';
import { useEditor } from '../../state/EditorProvider.jsx';
import { autoTone, autoWhiteBalance } from '../../engine/auto.js';
import { formatLabel } from '../../lib/image.js';
import { formatBytes } from '../../lib/format.js';
import { Panel, RoundButton, Segmented } from '../../components/ui.jsx';
import { AdjustmentSlider } from './AdjustmentSlider.jsx';

export function useAutoActions() {
  const { thumbnail, adjustments, apply } = useEditor();
  return {
    autoTone: () => thumbnail && apply({ adjustments: autoTone(thumbnail, adjustments) }),
    autoWhiteBalance: () => thumbnail && apply({ adjustments: autoWhiteBalance(thumbnail, adjustments) }),
  };
}

export function AdjustPanel({ onSavePreset }) {
  const { image, adjustments, ui, setUi, preview, commit, adjustmentsPristine, resetAdjustments } = useEditor();
  const auto = useAutoActions();

  const onPreview = useCallback((key, value) => preview({ adjustments: { [key]: value } }), [preview]);
  const onFocus = useCallback((focusedKey) => setUi({ focusedKey }), [setUi]);
  const onReset = useCallback((key) => {
    preview({ adjustments: { [key]: 0 } });
    commit();
  }, [preview, commit]);

  const visible = ADJUSTMENTS.filter((a) => a.group === ui.group);

  return (
    <Panel className="flex min-h-0 flex-col p-5">
      {/* On phones the top bar already shows the file name. */}
      <header className="hidden items-start justify-between gap-3 lg:flex">
        <div className="min-w-0">
          <h2 className="truncate text-[19px] font-bold tracking-tight" title={image.name}>
            {image.name}
          </h2>
          <p className="mt-1 text-[12px] text-white/45">
            {formatLabel(image.type)} · {formatBytes(image.size)} · {image.width} × {image.height}
          </p>
        </div>
        <img src={image.url} alt="" className="hairline h-11 w-16 shrink-0 rounded-lg object-cover" />
      </header>

      <Segmented
        label="Adjustment groups"
        className="lg:mt-5"
        value={ui.group}
        onChange={(group) => setUi({ group })}
        options={ADJUSTMENT_GROUPS.map(({ key, label }) => ({ value: key, label }))}
      />

      <div className="scrollbar-none -mx-5 mt-5 flex min-h-0 flex-1 flex-col justify-around gap-4 overflow-y-auto px-5 py-1">
        {visible.map((adjustment) => (
          <AdjustmentSlider
            key={adjustment.key}
            adjustment={adjustment}
            value={adjustments[adjustment.key]}
            focused={ui.focusedKey === adjustment.key}
            onPreview={onPreview}
            onCommit={commit}
            onFocus={onFocus}
            onReset={onReset}
          />
        ))}
      </div>

      <footer className="mt-4 flex items-center justify-center gap-4 border-t border-white/5 pt-4">
        <RoundButton label="Auto tone" onClick={auto.autoTone}>
          <span className="text-[9px] leading-none font-extrabold">AUTO</span>
        </RoundButton>
        <RoundButton label="Auto white balance" onClick={auto.autoWhiteBalance}>
          <Pipette className="size-4" />
        </RoundButton>
        <RoundButton label="Save as preset" disabled={adjustmentsPristine} onClick={onSavePreset}>
          <BookmarkPlus className="size-4" />
        </RoundButton>
        <RoundButton label="Reset adjustments" disabled={adjustmentsPristine} onClick={resetAdjustments}>
          <RotateCcw className="size-4" />
        </RoundButton>
      </footer>
    </Panel>
  );
}
