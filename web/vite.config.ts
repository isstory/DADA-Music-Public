import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'DADA Music',
        short_name: 'DADA',
        description: 'AI 음악 탐색·추천, YouTube Music으로 듣기',
        lang: 'ko',
        theme_color: '#121110',
        background_color: '#121110',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // API(GAS)·YouTube 썸네일은 캐시하지 않음 — 앱 셸만 오프라인 캐시
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
