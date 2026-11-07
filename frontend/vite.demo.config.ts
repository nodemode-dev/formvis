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

const inlineWorkers = (): Plugin => ({
  name: 'formvis-demo-inline-workers',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.ts$/.test(id) || id.includes('node_modules')) return null;
    const found = /new Worker\(new URL\('(\.\/[\w-]+\.ts)', import\.meta\.url\), \{ type: 'module'(?:, name: [^}]+)? \}\)/g;
    if (!found.test(code)) return null;
    found.lastIndex = 0;
    const imports: string[] = [];
    const out = code.replace(found, (_all, file: string) => { const v = `InlineWorker${imports.length}`; imports.push(`import ${v} from '${file}?worker&inline';`); return `new ${v}()`; });
    return { code: `${imports.join('\n')}\n${out}`, map: null };
  },
});

const demoPage = (): Plugin => ({
  name: 'formvis-demo-page',
  enforce: 'pre',
  transform(html, id) {
    if (!id.endsWith('/frontend/index.html')) return null;
    return html
      .replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="../demo/src/main.ts"></script>')
      .replace(/\s*<link rel="(?:icon|apple-touch-icon|preload)"[^>]*>/g, '')
      .replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="dark" data-demo="building">')
      .replace('body.app-ready #app { visibility: visible; }', 'body.app-ready #app { visibility: visible; }\n    html[data-demo="building"] #app { visibility: hidden !important; }\n    html[data-demo="building"]::before { content: "Starting formvis"; position: fixed; left: 0; right: 0; top: calc(50% - 30px); font: 13px -apple-system, "Segoe UI", system-ui, sans-serif; color: #a8a8b8; text-align: center; }\n    html[data-demo="building"]::after { content: ""; position: fixed; left: calc(50% - 90px); top: calc(50% - 2px); width: 180px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #3A7BFF, #9A5CFF 30%, #FF4F7A 62%, #FFAE2B) 0 0 / 60px 3px no-repeat #1f1f26; animation: demo-start 1.4s ease-in-out infinite alternate; }\n    @keyframes demo-start { to { background-position: 120px 0; } }')
      .replace('<title>FormVis</title>', '<title>FormVis demo</title>\n  <link rel="icon" href="assets/favicon.png" type="image/png">');
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
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  define: { 'import.meta.env.DEV': 'true' },
  worker: { format: 'iife', plugins: () => [useShim()] },
  resolve: { alias: { 'ag-psd': fileURLToPath(new URL('./node_modules/ag-psd', import.meta.url)), '@fontsource': fileURLToPath(new URL('./node_modules/@fontsource', import.meta.url)) } },
  plugins: [useShim(), inlineWorkers(), demoPage(), classicScript()],
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
