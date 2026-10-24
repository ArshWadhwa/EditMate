import { createContext, useContext } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { useToast } from '../../components/Toaster.jsx';
import { useInspiration } from './useInspiration.js';

const InspirationContext = createContext(null);

/** Lives above the dock so the reference survives switching between Inspire and Presets. */
export function InspirationProvider({ children }) {
  const { base, thumbnail } = useEditor();
  const toast = useToast();
  const inspiration = useInspiration({ base, thumbnail, onError: toast.error });
  return <InspirationContext.Provider value={inspiration}>{children}</InspirationContext.Provider>;
}

export function useInspirationContext() {
  const ctx = useContext(InspirationContext);
  if (!ctx) throw new Error('useInspirationContext must be used inside <InspirationProvider>');
  return ctx;
}
