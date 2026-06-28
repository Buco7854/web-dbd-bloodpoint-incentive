import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// The browser SPA. Reads only the server's cache API (/api/incentives); it never
// talks to BHVR directly. In dev we proxy API calls to the Fastify server.
export default defineConfig({
  root: path.resolve(rootDir, 'src/web'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(rootDir, 'dist/public'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
});
