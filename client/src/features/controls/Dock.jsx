/**
 * Bottom dock providing quick access to tools, presets, and history.
 */

import { Bookmark, Sparkles } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { Panel, Segmented, cx } from '../../components/ui.jsx';
import { InspireDock } from '../inspire/InspireDock.jsx';
import { PresetsDock } from '../presets/PresetsDock.jsx';
import { ControlPad } from './ControlPad.jsx';

const TABS = [
  { value: 'inspire', label: 'Inspire', icon: Sparkles },
  { value: 'presets', label: 'Presets', icon: Bookmark },
];

export function Dock({ className, onSavePreset }) {
  const { image, ui, setUi } = useEditor();

  return (
    <Panel className={cx('flex min-w-0 gap-5 p-4', className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Segmented label="Dock" size="sm" className="w-fit" value={ui.dock} onChange={(dock) => setUi({ dock })} options={TABS} />
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
