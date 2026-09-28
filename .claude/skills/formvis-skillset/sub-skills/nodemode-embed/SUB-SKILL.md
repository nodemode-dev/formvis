---
name: nodemode-embed
description: Running formvis inside NodeMode as an extension portal panel. Use for the portal ready and init handshake, the plugin assign message that sends images to the NodeMode canvas, the host theme bridge, data-theme, token writes from the host, or formvis looking wrong or silent inside NodeMode.
---

# nodemode-embed

Inside NodeMode, formvis is a full-screen portal panel in an iframe.

## Protocol (`frontend/src/host.ts`)

| Message | Direction | Content |
| --- | --- | --- |
| `ready` | formvis to host | Posted only after the message listener is attached |
| `init` | host to formvis | `pluginId`, `panelId`, optional state |
| `plugin:[pluginId]:assign` | formvis to host | `payload.files`: `name`, `mime`, `width`, `height`, `dataUrl` |
| `save`, `close` | both | Portal save and close |

Accept messages only when `event.source` is `window.parent`.

## Theme bridge

- The host copies its live tokens onto the iframe root, mirrors `theme-light` onto the body, and flips `data-theme` only when the root already has that attribute, so `frontend/index.html` ships `data-theme="dark"`.
- `startApp` observes root style and class changes plus `nm:ui-settings-changed`, then repaints the stage and thumbnails without rebuilding anything.
- Standalone and embedded share the `nodemode_ui_settings` storage key on the same origin, so the pre-paint theme boot already matches the host.

## Open item

The host-side handler for `assign` is not confirmed yet. Keep the payload shape stable until it is.
