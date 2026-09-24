import { defineConfig } from 'vite';

// Chemins relatifs : le build fonctionne aussi bien sur GitHub Pages (/gone-warior/)
// qu'en local via `npm run preview`.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
