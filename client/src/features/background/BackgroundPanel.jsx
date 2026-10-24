import { useRef } from 'react';
import { CircleAlert, Droplets, Image as ImageIcon, LoaderCircle, PaintBucket, ScanFace, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { ACCEPT_ATTR, firstImageFile } from '../../lib/image.js';
import { useToast } from '../../components/Toaster.jsx';
import { Panel, cx } from '../../components/ui.jsx';
import { ColorField, RangeField } from '../../components/fields.jsx';

const MODES = [
  { key: 'transparent', label: 'Remove', icon: ScanFace },
  { key: 'color', label: 'Colour', icon: PaintBucket },
  { key: 'image', label: 'Photo', icon: ImageIcon },
  { key: 'blur', label: 'Blur', icon: Droplets },
];

function ProgressBar({ value }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-950" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(4, value * 100)}%` }} />
    </div>
  );
}

export function BackgroundPanel() {
  const toast = useToast();
  const { background, subject, assets, apply, preview, commit } = useEditor();
  const fileRef = useRef(null);
  const ready = subject.status === 'ready';
  const working = subject.status === 'working';

  /** Picking a mode detects the subject first if needed, then switches. */
  const chooseMode = async (mode) => {
    if (mode === 'image' && !background.assetId) {
      fileRef.current?.click();
      return;
    }
    const mask = await subject.ensureMask();
    if (mask) apply({ background: { mode } });
  };

  const chooseImage = async (file) => {
    try {
      const asset = await assets.add(file);
      const mask = await subject.ensureMask();
      if (mask) apply({ background: { mode: 'image', assetId: asset.id } });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const backgroundAsset = background.assetId ? assets.map.get(background.assetId) : null;

  return (
    <Panel className="scrollbar-none flex min-h-0 flex-col overflow-y-auto p-5">
      <h2 className="text-[19px] font-bold tracking-tight">Background</h2>
      <p className="mt-1 text-[12px] text-white/45">Cut out the subject, then replace what's behind it.</p>

      {!ready && (
        <button
          type="button"
          disabled={working}
          onClick={() => chooseMode('transparent')}
          className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-extrabold text-ink-950 transition hover:bg-white/90 disabled:opacity-70"
        >
          {working ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {working ? 'Detecting subject…' : 'Remove background'}
        </button>
      )}

      {working && (
        <div className="mt-3 space-y-2">
          <ProgressBar value={subject.phase === 'download' ? subject.progress * 0.8 : 0.8 + subject.progress * 0.2} />
          <p className="text-[11px] text-white/45">
            {subject.phase === 'download' ? 'Downloading the AI model (first time only)…' : 'Finding the subject…'}
          </p>
        </div>
      )}

      {subject.status === 'error' && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[12px] text-rec">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {subject.error}. Check your connection and try again.
        </p>
      )}

      <p className="label mt-6">Replace with</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            disabled={working}
            aria-pressed={background.mode === key}
            onClick={() => chooseMode(key)}
            className={cx(
              'flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40',
              background.mode === key ? 'bg-white text-ink-950' : 'bg-ink-700 text-white/75 hover:text-white',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {background.mode === 'color' && (
          <ColorField
            label="Background colour"
            value={background.color}
            onChange={(color) => apply({ background: { color } })}
            onLive={(color) => preview({ background: { color } })}
            onCommit={commit}
          />
        )}

        {background.mode === 'image' && (
          <div className="flex items-center gap-3">
            {backgroundAsset && <img src={backgroundAsset.url} alt="" className="hairline h-12 w-16 rounded-lg object-cover" />}
            <button type="button" onClick={() => fileRef.current?.click()} className="h-9 rounded-xl bg-ink-700 px-4 text-[12px] font-bold hover:bg-ink-600">
              {backgroundAsset ? 'Change photo' : 'Choose photo'}
            </button>
          </div>
        )}

        {background.mode === 'blur' && (
          <RangeField
            label="Blur amount"
            value={background.blur}
            min={5}
            max={100}
            onChange={(blur) => preview({ background: { blur } })}
            onCommit={commit}
          />
        )}

        {background.mode !== 'original' && (
          <button
            type="button"
            onClick={() => apply({ background: { mode: 'original' } })}
            className="flex items-center gap-2 text-[12px] font-bold text-white/60 hover:text-white"
          >
            <Undo2 className="size-3.5" />
            Restore original background
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const file = firstImageFile(e.target.files);
          if (file) chooseImage(file);
          e.target.value = '';
        }}
      />

      <p className="mt-auto flex items-start gap-2 pt-6 text-[11px] leading-relaxed text-white/35">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
        Runs on your device. The first use downloads the AI model once (about 40–80 MB).
        {background.mode === 'transparent' && ' Transparent backgrounds export as PNG.'}
      </p>
    </Panel>
  );
}
