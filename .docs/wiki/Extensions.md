# Extensions

formvis is a host of the Form Extension Contract, API 1, the same contract every Form app follows. FormPortal installs extensions, form.ext makes them and runs them in development, formai.studio lists them. The developer reference, with the document snapshot, the commands and the events, is [`docs/EXTENSIONS.md`](../../docs/EXTENSIONS.md).

## How it fits

| Part | Where |
| --- | --- |
| Resolver and safe file serving (kit, vendored unchanged) | `backend/app/services/formext_host.py` |
| Routes: `GET /api/extensions`, `GET /api/extensions/stamp`, `GET /api/extensions/files/{id}/{version}/{path}`, `POST /api/extensions/portal` | `backend/app/routers/extensions.py` |
| The opaque-origin frame's file reads let through | `backend/app/core/local_guard.py` (`_extension_file`) |
| Host bridge (kit, vendored unchanged): sandboxed frames, JSON-RPC, permissions, timeouts | `frontend/src/formext/host-bridge.ts` |
| formvis's handlers, polling, commands, panels, events | `frontend/src/formext/extensions.ts` |
| Window > Extensions | `frontend/src/ui/extensions-panel.ts`, `frontend/src/styles/extensions.css` |
| Consent | `frontend/src/ui/panels/extension-consent.ts` |
| Agents | MCP `extensions_list`, `extension_command` (`backend/app/routers/mcp.py`, answered in `automation/agent-bridge.ts`); `./formvis cli extensions` |

## Rules the host keeps

- Every extension page runs in `sandbox="allow-scripts"` with no other token; the host never reads its DOM; messages are taken only from that frame.
- The window is cross-origin isolated (COOP same-origin, COEP credentialless). Extension files carry `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Resource-Policy: cross-origin`, so the frame loads inside it, plus the contract's CSP, `nosniff`, `no-store` and `Access-Control-Allow-Origin: *`.
- `document.apply` is one history step named by the extension; a failing op undoes the ones before it. Ops are catalogue commands or the listed `tool:` window tools; risky commands are refused.
- The menu, the panel and its rows exist before the first paint (the rows from the list kept at the last start); the 2 second stamp poll and Reload Extensions patch only the rows that changed.
- The older plugin kinds (Plugins menu, plugin folders in sealed workers with `PLUGIN_WORKER_CSP`, WebAssembly filter plug-ins) are untouched; Manage Plugins links to the Extensions panel.

## Trying it

```sh
mkdir -p /tmp/portal/extensions/formvis
FORMPORTAL_ROOT=/tmp/portal ./formvis boot
```

Write `/tmp/portal/extensions/formvis/dev.json` naming an extension folder (see the developer reference), then Extensions > Reload Extensions.
