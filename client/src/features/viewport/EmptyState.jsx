import { ImageUp, ShieldCheck } from 'lucide-react';
import { Kbd } from '../../components/ui.jsx';

export function EmptyState({ onOpenFile }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(600px_300px_at_50%_40%,rgb(244_211_94/0.08),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-6 rounded-2xl border border-dashed border-white/10" />

      <div className="relative flex max-w-sm flex-col items-center text-center">
        <div className="hairline grid size-16 place-items-center rounded-2xl bg-ink-800">
          <ImageUp className="size-7 text-accent" />
        </div>
        <h1 className="mt-6 text-[22px] font-bold tracking-tight">Drop a photo to start editing</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          Tune light and colour by hand, or drop an inspiration image and EditMate will suggest a recipe for <em>your</em> photo.
        </p>
        <button
          type="button"
          onClick={onOpenFile}
          className="mt-6 h-11 rounded-xl bg-white px-6 text-[13px] font-extrabold text-ink-950 transition hover:bg-white/90"
        >
          Choose a photo
        </button>
        <p className="mt-3 text-[12px] text-white/35">
          or press <Kbd>⌘O</Kbd> · JPEG, PNG, WebP, AVIF
        </p>
        <p className="mt-8 flex items-center gap-2 text-[12px] text-white/40">
          <ShieldCheck className="size-4 text-ok" />
          Photos never leave your device. Editing runs in your browser.
        </p>
      </div>
    </div>
  );
}
