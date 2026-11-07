import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const DEMO_PORT = 5191;
const shim = fileURLToPath(new URL('../demo/src/shim/wasm-kernels.ts', import.meta.url));

const useShim = (): Plugin => ({
  name: 'formvis-demo-wasm-shim',
  enforce: 'pre',
  resolveId(source) {
    return /(^|\/)wasm-kernels$/.test(source) ? shim : null;
  },
});

const classicScript = (): Plugin => ({
  name: 'formvis-demo-classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/;
    const found = html.match(tag);
    if (!found) return html;
    return html.replace(tag, '').replace('</body>', `<script defer src="${found[1]}"></script>\n</body>`).replace(/ crossorigin(?=[ >])/g, '');
  },
});

export default defineConfig({
  root: fileURLToPath(new URL('../demo/src', import.meta.url)),
  base: './',
  publicDir: false,
  resolve: { alias: { 'ag-psd': fileURLToPath(new URL('./node_modules/ag-psd', import.meta.url)), '@fontsource': fileURLToPath(new URL('./node_modules/@fontsource', import.meta.url)) } },
  plugins: [useShim(), classicScript()],
  server: { host: false, port: DEMO_PORT, strictPort: true, fs: { allow: ['..', '../demo'] } },
  preview: { host: false, port: DEMO_PORT + 1, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('../demo', import.meta.url)),
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/demo.js',
        assetFileNames: (info) => (info.names?.some((n) => n.endsWith('.css')) ? 'assets/demo.css' : 'assets/[name][extname]'),
      },
    },
  },
});
