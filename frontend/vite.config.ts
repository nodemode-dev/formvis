import { defineConfig, type Plugin } from 'vite';

const FRONTEND_PORT = 5190;
// FORMVIS_BACKEND_PORT points the /api proxy somewhere else, e.g. at a closed port to run the browser build with no engine service.
const BACKEND_PORT = Number(process.env.FORMVIS_BACKEND_PORT) || 8190;

// A cross-origin isolated window (SharedArrayBuffer); credentialless keeps pictures and fonts from other sites loading.
const ISOLATION = process.env.FORMVIS_ISOLATED === '0' ? {} : { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

// The sealed folder-plugin worker gets a closed policy here too (the engine sets PLUGIN_WORKER_CSP for the built app). The dev
// server also has to serve the worker's own imports (the Vite client) from the same origin, so scripts allow 'self' and blob:.
const PLUGIN_WORKER_DEV_CSP = `default-src 'none'; script-src blob: 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; img-src 'none'; style-src 'none'`;
const pluginWorkerPolicy = (): Plugin => ({
  name: 'formvis-plugin-worker-policy',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (!path.startsWith('/api') && name.startsWith('plugin-worker') && /\.(ts|js)$/.test(name)) res.setHeader('Content-Security-Policy', PLUGIN_WORKER_DEV_CSP);
      next();
    });
  },
});

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [pluginWorkerPolicy()],
  server: {
    // The manual lives in ../docs (one copy for the repository and the app, 1.52.3): the dev server may read the repository.
    fs: { allow: ['..'] },
    port: FRONTEND_PORT,
    host: false,
    strictPort: true,
    headers: ISOLATION,
    proxy: {
      '/api': { target: `http://127.0.0.1:${BACKEND_PORT}`, changeOrigin: true, ws: true },
    },
  },
  preview: {
    headers: ISOLATION,
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
