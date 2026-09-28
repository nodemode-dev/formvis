---
name: ui-shell
description: The formvis UI shell in frontend/src/app.ts, frontend/src/ui and frontend/src/styles. Use for the stage canvas, layers panel, tool rail, options bar, tabs, status bar, menus, context menus, dialogs, toasts, commands and keyboard shortcuts, NodeMode tokens, themes, icons, z-index, and any flash, flicker, layout jump or re-render bug.
---

# ui-shell

The shell is mounted once from the template in `frontend/src/app.ts` and patched in place afterwards. Components subscribe to engine events and coalesce their work into one animation frame.

## Rules with the helpers in `frontend/src/ui/dom.ts`

- Keyed lists use `patchList` (layer rows, tabs, library and shortcut lists). Nodes are updated or moved, never rebuilt.
- Single values use `setText`, `setClass`, `setHidden`, `setDisabled`, `setValue`, `setChecked`, `setTitle`, `setStyleVar`. Markup swaps use `setHtml`, which builds in a fresh template and calls `replaceChildren`.
- Never assign to `innerHTML` on a live container, and never clear and refill.
- Reserve space: tabs are a fixed 168 px, the mask thumbnail slot is always reserved, status slots have minimum widths.
- The stage redraws synchronously inside its ResizeObserver callback so a resize never shows a blank canvas.
- Reveal: `index.html` preloads the three Inter weights; `startApp` awaits them, capped at 2.5 s, before `revealApp`.

## Commands, menus, dialogs

- Commands live in the `commands.add(...)` block in `app.ts`: `id`, `label` (text or function), `keys` such as `Mod+Shift+N`, `enabled`, `checked`, `run`. Mod is Command on macOS and Ctrl elsewhere. Browsers keep Mod+N, Mod+W and Mod+T, so give those an Alt variant.
- Buttons with `data-cmd` run commands; their titles and disabled states are synced for you.
- Dialogs extend `Dialog` in `frontend/src/ui/dialogs.ts`. `open()` moves the dialog to the end of the overlay root and guarantees focus lands inside it.
- Pointer capture: capture only after a drag passes its threshold. Capturing on press retargets `click` and `dblclick` to the container.

## Styles

`tokens.css` is the NodeMode token file verbatim plus a formvis block. Stacking uses `--z-*` tokens only. `scrollbars.css` stays the last stylesheet. The audit must read 0 FAIL, 0 WARN:

```bash
python3 /mnt/skills/user/stylized-nodemode/scripts/audit_style.py frontend --tokens-file src/styles/tokens.css --strict
```

Finish every UI change with `ui-verification`.
