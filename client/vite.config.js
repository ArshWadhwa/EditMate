import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Background removal is imported lazily; pre-bundle it at startup so the first click
    // doesn't trigger a dependency re-optimisation (and a stale-module error) in dev.
    include: ['@imgly/background-removal'],
  },
});
