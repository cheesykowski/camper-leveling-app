import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_ACTIONS === 'true' ? '/camper-leveling-app/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'offline-asset-list',
      generateBundle(_options, bundle) {
        const files = Object.values(bundle)
          .filter((entry) => entry.type === 'chunk' || /\.(css|html)$/.test(entry.fileName))
          .map((entry) => entry.fileName);
        this.emitFile({
          type: 'asset',
          fileName: 'offline-assets.json',
          source: JSON.stringify([
            ...new Set([
              ...files,
              'index.html',
              'offline-assets.json',
              'manifest.webmanifest',
              'icons/icon-192.png',
              'icons/icon-512.png',
            ]),
          ]),
        });
      },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'KEILOMAT',
        short_name: 'KEILOMAT',
        description: 'Camper leveling assistant',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#070d0a',
        theme_color: '#070d0a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,webmanifest}'],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
