import { useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** True when the keystroke belongs to a text field or an open dialog, not the editor. */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('dialog[open]')) return true;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox';
}

/** Controls that already use the arrow keys themselves. */
const ownsArrows = (target) =>
  target instanceof HTMLElement && (target.matches('input[type="range"]') || target.getAttribute('role') === 'slider');

/**
 * `handlers(event, { mod, key, ownsArrows })` returns true when it handled the event.
 * The latest handlers are always used, so callers can pass an inline function.
 */
export function useHotkeys(onKeyDown, onKeyUp) {
  const down = useRef(onKeyDown);
  const up = useRef(onKeyUp);
  down.current = onKeyDown;
  up.current = onKeyUp;

  useEffect(() => {
    const context = (e) => ({
      mod: isMac ? e.metaKey : e.ctrlKey,
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
      ownsArrows: ownsArrows(e.target),
    });

    const handleDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (down.current?.(e, context(e))) e.preventDefault();
    };
    const handleUp = (e) => {
      if (isTypingTarget(e.target)) return;
      up.current?.(e, context(e));
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);
}

export const MOD_LABEL = isMac ? '⌘' : 'Ctrl';
