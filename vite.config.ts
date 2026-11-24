import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The game server serves web/dist itself; `npm run dev` is only for UI work and
// proxies the realtime config and the WebSocket fallback to a local server.
export default defineConfig({
  root: 'web',
  plugins: [svelte({ configFile: '../svelte.config.js' })],
  resolve: { dedupe: ['svelte', 'three', '@threlte/core', 'golem-engine'] },
  // three.js alone is most of the bundle; one chunk is fine for a tiny game.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', ws: true } },
  },
});
