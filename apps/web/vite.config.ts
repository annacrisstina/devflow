import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev keeps ONE origin (ADR-0013's cookie model): the Vite server proxies
// API and websocket traffic to the Fastify process, so the browser never
// sees a second host and the session cookie just works.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
});
