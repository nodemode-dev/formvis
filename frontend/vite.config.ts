import { defineConfig } from 'vite';

const FRONTEND_PORT = 5190;
// FORMVIS_BACKEND_PORT points the /api proxy somewhere else, e.g. at a closed port to run the browser build with no engine service.
const BACKEND_PORT = Number(process.env.FORMVIS_BACKEND_PORT) || 8190;

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    // The manual lives in ../docs (one copy for the repository and the app, 1.52.3): the dev server may read the repository.
    fs: { allow: ['..'] },
    port: FRONTEND_PORT,
    host: false,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true, ws: true },
    },
  },
  preview: {
    port: FRONTEND_PORT + 1,
    host: false,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
