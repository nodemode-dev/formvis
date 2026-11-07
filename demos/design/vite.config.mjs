import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FRONTEND = here('../../frontend');
const SHIM = here('../../demo/src/shim/wasm-kernels.ts');
const STYLE_BLOCK = 'body.app-ready #app { visibility: visible; }';

const useShim = () => ({
  name: 'formvis-design-wasm-shim',
  enforce: 'pre',
  resolveId(source) {
    return /(^|\/)wasm-kernels$/.test(source) ? SHIM : null;
  },
});

const inlineWorkers = () => ({
  name: 'formvis-design-inline-workers',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.ts$/.test(id) || id.includes('node_modules')) return null;
    const found = /new Worker\(new URL\('(\.\/[\w-]+\.ts)', import\.meta\.url\), \{ type: 'module'(?:, name: [^}]+)? \}\)/g;
    if (!found.test(code)) return null;
    found.lastIndex = 0;
    const imports = [];
    const out = code.replace(found, (_all, file) => {
      const v = `InlineWorker${imports.length}`;
      imports.push(`import ${v} from '${file}?worker&inline';`);
      return `new ${v}()`;
    });
    return { code: `${imports.join('\n')}\n${out}`, map: null };
  },
});

const windowPage = () => ({
  name: 'formvis-design-page',
  enforce: 'pre',
  transform(_stub, id) {
    if (!id.endsWith('/design/src/index.html')) return null;
    const real = readFileSync(`${FRONTEND}/index.html`, 'utf8');
    return real
      .replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="./main.ts"></script>')
      .replace(/href="\/src\/styles\//g, 'href="../../../frontend/src/styles/')
      .replace(/\s*<link rel="(?:icon|apple-touch-icon|preload)"[^>]*>/g, '')
      .replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="dark" data-demo="building">')
      .replace(STYLE_BLOCK, `${STYLE_BLOCK}
    html[data-demo="building"] #app { visibility: hidden !important; }
    html[data-demo="building"]::before { content: "Starting formvis"; position: fixed; left: 0; right: 0; top: calc(50% - 30px); font: 13px -apple-system, "Segoe UI", system-ui, sans-serif; color: #a8a8b8; text-align: center; }
    html[data-demo="building"]::after { content: ""; position: fixed; left: calc(50% - 90px); top: calc(50% - 2px); width: 180px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #3A7BFF, #9A5CFF 30%, #FF4F7A 62%, #FFAE2B) 0 0 / 60px 3px no-repeat #1f1f26; animation: demo-start 1.4s ease-in-out infinite alternate; }
    @keyframes demo-start { to { background-position: 120px 0; } }`)
      .replace('<title>FormVis</title>', '<title>FormVis demo: type and design</title>\n  <link rel="icon" href="../../../demo/assets/favicon.png" type="image/png">');
  },
});

const symbol = (cp) => (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f000 && cp <= 0x1faff);
const unit = (n) => `\\u${n.toString(16).toUpperCase().padStart(4, '0')}`;
const escapeSymbols = () => ({
  name: 'formvis-demo-escape-symbols',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'chunk') continue;
      let out = '';
      for (const ch of file.code) {
        const cp = ch.codePointAt(0) ?? 0;
        out += !symbol(cp) ? ch : cp > 0xffff ? unit(0xd800 + ((cp - 0x10000) >> 10)) + unit(0xdc00 + ((cp - 0x10000) & 0x3ff)) : unit(cp);
      }
      file.code = out;
    }
  },
});

const classicScript = () => ({
  name: 'formvis-design-classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/;
    const found = html.match(tag);
    if (!found) return html;
    return html.replace(tag, '').replace('</body>', `<script defer src="${found[1]}"></script>\n</body>`).replace(/ crossorigin(?=[ >])/g, '');
  },
});

export default {
  root: here('./src'),
  base: './',
  publicDir: false,
  define: { 'import.meta.env.DEV': 'true' },
  worker: { format: 'iife', plugins: () => [useShim()] },
  resolve: {
    alias: {
      'ag-psd': `${FRONTEND}/node_modules/ag-psd`,
      '@fontsource': `${FRONTEND}/node_modules/@fontsource`,
    },
  },
  plugins: [useShim(), inlineWorkers(), windowPage(), classicScript(), escapeSymbols()],
  server: { host: false, port: 5291, strictPort: true, fs: { allow: ['../..'] } },
  build: {
    outDir: here('.'),
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
        entryFileNames: 'assets/design.js',
        assetFileNames: (info) => (info.names?.some((n) => n.endsWith('.css')) ? 'assets/design.css' : 'assets/[name][extname]'),
      },
    },
  },
};
