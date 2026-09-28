# NodeMode Embedding

Inside NodeMode, formvis runs as a full-screen extension portal panel. It follows the portal protocol and the host theme bridge.

| Message | Direction | Meaning |
| --- | --- | --- |
| `ready` | formvis to host | Posted after the message listener is attached |
| `init` | host to formvis | Carries `pluginId`, `panelId` and optional state |
| `plugin:<pluginId>:assign` | formvis to host | File, Send to NodeMode Canvas: `payload.files` holds `name`, `mime`, `width`, `height`, `dataUrl` |
| `close` | both | Close the panel |

| Source path | What lives there |
| --- | --- |
| `frontend/src/host.ts` | `HostLink`: handshake, assign, save, close |
| `frontend/index.html` | `data-theme` on the root, so the bridge can flip light and dark |
| `frontend/src/app.ts` | The theme observer that repaints when the host writes tokens |

## Contract

- Attach the listener before posting `ready`.
- Accept messages only from `window.parent`.
- Theme changes arrive as token writes on the root; repaint without rebuilding anything.
- The host-side handler for `assign` is not confirmed yet; keep the payload shape stable until it is.
