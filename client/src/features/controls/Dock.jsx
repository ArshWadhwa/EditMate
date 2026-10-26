/**
 * Bottom dock providing quick access to tools, presets, and history.
 */

import { Bookmark, LayoutGrid, Sparkles } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { Panel, Segmented, cx } from '../../components/ui.jsx';
import { InspireDock } from '../inspire/InspireDock.jsx';
import { PresetsDock } from '../presets/PresetsDock.jsx';
import { usePresets } from '../presets/PresetsProvider.jsx';
import { ControlPad } from './ControlPad.jsx';

const TABS = [
  { value: 'inspire', label: 'Inspire', icon: Sparkles },
  { value: 'presets', label: 'Presets', icon: Bookmark },
];

export function Dock({ className, onSavePreset }) {
  const { image, ui, setUi } = useEditor();
  const { builtIn, saved, openAllPresets } = usePresets();

  return (
    <Panel className={cx('flex min-w-0 gap-5 p-4', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Segmented label="Dock" size="sm" className="w-fit" value={ui.dock} onChange={(dock) => setUi({ dock })} options={TABS} />
          {ui.dock === 'presets' && (
            <button
              type="button"
              onClick={openAllPresets}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-all hover:border-white/25 hover:bg-white/10 hover:text-white"
              title="Open all presets in a popup window"
            >
              <LayoutGrid className="size-3.5 text-accent" />
              <span>All presets</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">
                {builtIn.length + saved.length}
              </span>
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 sm:flex-row">
          {!image ? (
            <p className="self-center text-[13px] text-white/40">Open a photo to get recipes from inspiration images and use presets.</p>
          ) : ui.dock === 'inspire' ? (
            <InspireDock onSavePreset={onSavePreset} />
          ) : (
            <PresetsDock onSavePreset={onSavePreset} />
          )}
        </div>
      </div>
      <div className="hidden xl:flex">
        <ControlPad disabled={!image} />
      </div>
    </Panel>
  );
}
