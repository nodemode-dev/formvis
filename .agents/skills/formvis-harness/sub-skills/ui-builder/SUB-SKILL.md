---
name: ui-builder
description: The formvis UI shell in frontend/src/app.ts, frontend/src/ui and frontend/src/styles. Use for the stage canvas, layers panel, tool rail, options bar, tabs, status bar, menus, dialogs, panels and the dock, toasts, design tokens, themes, icons, the z-index scale, hidden scrollbars, the zero-DOM-flash rule, and any flash, flicker, layout jump, blank canvas frame or re-render bug, plus the throttled browser verification and NodeMode embedding.
---

# ui-builder

The shell is mounted once from the template in `frontend/src/app.ts` (`startApp`) and patched in place afterwards. Components subscribe to engine events (`engine.on('doc' | 'projects' | 'active' | 'options' | 'overlay' | 'render', ...)`) and coalesce their work into one animation frame.

## The zero-DOM-flash law

Render once, then patch. Never clear and refill a live container.

- Keyed lists use `patchList(container, items, { key, create, update })` from `frontend/src/ui/dom.ts`: nodes are updated or moved by `data-key`, never rebuilt. Keys are stable ids, never array indexes.
- Single values use `setText`, `setClass`, `setHidden`, `setDisabled`, `setValue` (skips a focused input), `setChecked`, `setTitle`, `setStyleVar`. Markup swaps use `setHtml(node, html, key)`, which builds in a fresh template and calls `replaceChildren` only when the key changes. `mountOnce(host, html)` mounts a template once.
- Never assign `innerHTML` on a live container. Images swap with `swapMedia(img, nextSrc)` (decode off-screen, then one write).
- Reserve space with `reserve(el, { width, height, minHeight, aspect })`: tabs are a fixed 168 px, the mask thumbnail slot is always reserved, status slots have minimum widths. Loading indicators use `delayedIndicator` or `pendingClass` (300 ms delay, 250 ms minimum) so quick work shows nothing.
- The stage redraws synchronously inside its ResizeObserver callback so a resize never shows a blank canvas.
- Reveal: `index.html` ships `data-theme="dark"`, a critical inline style, `#app { visibility: hidden }`, a theme-boot script and preloads for three Inter weights; `startApp` awaits the fonts (capped at 2.5 s), then `revealApp()` adds `body.app-ready`.
- Every UI change passes `references/verification.md` before hand-back.

## Tokens, z-index, scrollbars

- `frontend/src/styles/tokens.css` is the NodeMode token file verbatim plus a formvis block. Colours, spacing, radii and fonts come from tokens; no raw colours in component CSS. Light mode lives in `light-mode.css` (class `body.theme-light`); 14 theme profiles are in `frontend/src/ui/themes.ts` (`THEMES`, `applyTheme`, storage key `nodemode_ui_settings`), and `index.html`'s boot script keeps the same ids.
- Stack order uses only `var(--z-*)`. The scale: `--z-base` 0, `--z-raised` 8, `--z-selected` 9, `--z-rail` 10, `--z-chrome` 100, `--z-menu` 200, `--z-temp` 500, `--z-companion` 800, `--z-taskbar` 900, `--z-modal` 1000, `--z-settings` 1500, `--z-context` 2000 (context menus, dialogs), `--z-toast` 3000, `--z-portal` 4000 to 6999, `--z-home` 10000 and its 10010, 10100, 10500 siblings, `--z-overlay` 50000, `--z-overlay-modal` 60000, `--z-debug` 100000. Never a raw number, never 9999.
- No scrollbar is ever drawn. `frontend/src/styles/scrollbars.css` hides them with `scrollbar-width: none !important` and `::-webkit-scrollbar { display: none !important }`; content still scrolls by wheel, touch and keys. It must stay the last stylesheet in `index.html`. Do not add `overflow: scroll` UI that depends on a visible bar.
- Icons: `icon(name, size)` and `ICONS` in `frontend/src/ui/icons.ts`, inline SVG with `currentColor`; `hasIcon(name)` checks. Copy a missing icon verbatim from the NodeMode icon module; no icon libraries, no emoji.
- The style audit must read 0 FAIL and 0 WARN when the stylized-nodemode audit script is available: `python3 /mnt/skills/user/stylized-nodemode/scripts/audit_style.py frontend --tokens-file src/styles/tokens.css --strict`.

## Dialogs, panels, menus

- A dialog extends `Dialog` (`frontend/src/ui/dialogs.ts`): `super(title, width)`, fill `body` and `foot` once in the constructor, `open(focus?)`, `close()`, `onClose`. The scrim mounts in `#overlay-root`; `open()` re-appends it so the newest dialog is on top and moves focus inside. Helpers: `confirmAction`, `promptName`, `askSaveChanges`, `askSaveChangesAll`, and `anyDialogOpen()`. Feedback uses `toast(text, 'info' | 'error')`.
- Panels live in `frontend/src/ui/panels/` and `frontend/src/ui/`; dockable ones are listed in `DOCK_PANELS` and `SIDE_PANELS` in `frontend/src/ui/dock.ts` (`registerPanel` adds a detached group). A new panel gets an entry there, a Window menu command, and a place in `Dock` defaults.
- Commands, menus, shortcuts: see `command-author`. Tool option rows: see `tool-builder`.
- Pointer capture: capture only after a drag passes its threshold. Capturing on press retargets `click` and `dblclick` to the container.
- Prefs: `loadPrefs`, `savePrefs`, `DEFAULT_PREFS`, `Prefs` in `frontend/src/ui/prefs.ts`; a new setting needs its default, its reader clamp and a Preferences control (`app-dialogs.ts`).

## NodeMode embedding

formvis runs as a portal panel inside NodeMode; the host link is `frontend/src/host.ts`. The protocol, theme bridge and open items are in `references/desktop-and-embedding.md`; read it before touching `host.ts`, `index.html`'s theme boot or `nodemode_ui_settings`.

## Finish

Log the change in `frontend/HASHOUT_LOG.md`, run the verification in `references/verification.md`, and report exactly one of: verified under throttling, verified without throttling (with the reason), or not verified.
