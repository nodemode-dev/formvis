import { fileURLToPath } from 'node:url';
import { readFileSync, renameSync, existsSync } from 'node:fs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const frontend = here('../../frontend');
const shim = here('../../demo/src/shim/wasm-kernels.ts');
const appPage = here('../../frontend/index.html');
const outDir = here('.');

const useShim = () => ({
  name: 'formvis-retouch-wasm-shim',
  enforce: 'pre',
  resolveId(source) {
    return /(^|\/)wasm-kernels$/.test(source) ? shim : null;
  },
});

const inlineWorkers = () => ({
  name: 'formvis-retouch-inline-workers',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.ts$/.test(id) || id.includes('node_modules')) return null;
    const found = /new Worker\(new URL\('(\.\/[\w-]+\.ts)', import\.meta\.url\), \{ type: 'module'(?:, name: [^}]+)? \}\)/g;
    if (!found.test(code)) return null;
    found.lastIndex = 0;
    const imports = [];
    const out = code.replace(found, (_all, file) => { const v = `InlineWorker${imports.length}`; imports.push(`import ${v} from '${file}?worker&inline';`); return `new ${v}()`; });
    return { code: `${imports.join('\n')}\n${out}`, map: null };
  },
});

const appShell = () => ({
  name: 'formvis-retouch-page',
  enforce: 'pre',
  resolveId(source) {
    return source === 'shell.html' || source === `${outDir}/shell.html` ? `${outDir}/shell.html` : null;
  },
  load(id) {
    if (!id.endsWith('/shell.html')) return null;
    return readFileSync(appPage, 'utf8')
      .replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="./src/main.ts"></script>')
      .replace(/\s*<link rel="(?:icon|apple-touch-icon|preload)"[^>]*>/g, '')
      .replace(/href="\/src\/styles\//g, 'href="../../frontend/src/styles/')
      .replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="dark" data-demo="building">')
      .replace('body.app-ready #app { visibility: visible; }', 'body.app-ready #app { visibility: visible; }\n    html[data-demo="building"] #app { visibility: hidden !important; }\n    html[data-demo="building"]::before { content: "Opening the retouching session"; position: fixed; left: 0; right: 0; top: calc(50% - 30px); font: 13px -apple-system, "Segoe UI", system-ui, sans-serif; color: #a8a8b8; text-align: center; }\n    html[data-demo="building"]::after { content: ""; position: fixed; left: calc(50% - 90px); top: calc(50% - 2px); width: 180px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #3A7BFF, #9A5CFF 30%, #FF4F7A 62%, #FFAE2B) 0 0 / 60px 3px no-repeat #1f1f26; animation: demo-start 1.4s ease-in-out infinite alternate; }\n    @keyframes demo-start { to { background-position: 120px 0; } }')
      .replace('<title>FormVis</title>', '<title>FormVis demo: selections and retouching</title>\n  <link rel="icon" href="assets/favicon.png" type="image/png">');
  },
});

const classicScript = () => ({
  name: 'formvis-retouch-classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/;
    const found = html.match(tag);
    if (!found) return html;
    return html.replace(tag, '').replace('</body>', `<script defer src="${found[1]}"></script>\n</body>`).replace(/ crossorigin(?=[ >])/g, '');
  },
});

const asIndex = () => ({
  name: 'formvis-retouch-as-index',
  apply: 'build',
  writeBundle() {
    const built = `${outDir}/shell.html`;
    if (!existsSync(built)) return;
    renameSync(built, `${outDir}/index.html`);
  },
});

export default {
  root: outDir,
  base: './',
  publicDir: false,
  define: { 'import.meta.env.DEV': 'true' },
  worker: { format: 'iife', plugins: () => [useShim()] },
  resolve: { alias: { 'ag-psd': `${frontend}/node_modules/ag-psd`, '@fontsource': `${frontend}/node_modules/@fontsource` } },
  plugins: [useShim(), inlineWorkers(), appShell(), classicScript(), asIndex()],
  server: { host: false, port: 5192, strictPort: true, fs: { allow: ['../..'] } },
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: `${outDir}/shell.html`,
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/retouch.js',
        assetFileNames: (info) => (info.names?.some((n) => n.endsWith('.css')) ? 'assets/retouch.css' : 'assets/[name][extname]'),
      },
    },
  },
};
