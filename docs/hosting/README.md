# Hosting the static web build

The frontend builds to a static folder that any file server can host. Without the engine service the editor still opens, makes
documents and paints; the features that call the engine service (`/api`) have nothing to answer them on a static host.

## Build

From `frontend/`:

    npx vite build --base /formvis/ --outDir /path/to/site --emptyOutDir

`--base` is the URL path the folder is served under: `/` for a site root, `/formvis/` for a sub-path (tested); build once per path. The folder holds `index.html`, `assets/` (hashed, safe to cache for a year), `fonts/`,
`wasm-plugins/` and the icons. Add `--sourcemap false` to leave the maps out.

## Headers the app needs

The window is cross-origin isolated (shared memory for the worker pool and precise timers). Every page and asset is served with:

    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: credentialless

`credentialless` rather than `require-corp` lets pictures and fonts from other sites still load. The engine sets the same two
headers (`backend/app/main.py`, `IsolateWindow`) and the dev server sets them in `frontend/vite.config.ts`; turning them off
(`FORMVIS_ISOLATED=0`) only costs the isolation.

The sealed folder-plugin worker (`assets/plugin-worker-*.js`) additionally gets the closed policy the engine gives it:

    Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; img-src 'none'; style-src 'none'

`.wasm` files must be served as `application/wasm`.

## Embedding in another page

When another page frames the app, that page must itself allow it: if the parent is cross-origin isolated it needs
`Cross-Origin-Embedder-Policy: credentialless` too, and the app's host must not send `X-Frame-Options` or a restrictive
`frame-ancestors`. The app and its parent talk by `postMessage` (`frontend/src/host.ts`): the app posts `ready`, the parent answers
`init` and `close`, and the app posts `save`, `close` and `plugin:<id>:assign`.

## Samples

| Server | File | Where it goes |
|---|---|---|
| Static hosts that read a `_headers` file in the published folder | `headers-file/_headers` | the root of the published folder |
| nginx | `nginx/formvis.conf` | a `server` block in the site configuration |
| Apache | `apache/.htaccess` | the root of the published folder (needs `mod_headers`) |

Check a deployment by opening the page and running `crossOriginIsolated` in the browser console: it must be `true`.
