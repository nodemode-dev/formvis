# UI Shell

The shell is mounted once from a string template and then patched in place: nothing already rendered is rebuilt. It holds the titlebar (menus, tabs, zoom), the options bar, the tool rail, the stage, the layers panel and the status bar, plus dialogs and toasts in their own roots.

| Source path | What lives there |
| --- | --- |
| `frontend/src/app.ts` | Mounting, commands, menus, keyboard, paste, drag and drop, file I/O flows, the reveal gate |
| `frontend/src/ui/stage.ts` | Scene and overlay canvases, pointer input, pixel view at 200 percent and up, marching ants, the sample ring |
| `frontend/src/ui/layers.ts` | Keyed layer rows, thumbnails, visibility swipe, drag reorder (Option duplicates), Option-click clipping on a row's lower edge, Option-drag mask copy, drag onto another project's tab to copy the layer there, rename, context menu |
| `frontend/src/ui/rail.ts`, `options.ts`, `tabs.ts`, `status.ts` | Tool rail and colors (the swatches open the color picker), options bar with editable number fields, project tabs, status bar |
| `frontend/src/ui/menu.ts`, `dialogs.ts`, `app-dialogs.ts`, `toast.ts`, `commands.ts` | Menus (File's Open Recent section is computed each time the menu opens), dialogs (a click-through scrim lets eyedroppers reach the canvas), toasts, the command registry and key labels |
| `frontend/src/ui/brand.ts` | The app mark, inline on the welcome card and in About (the same artwork as the desktop icon and favicon), with its ids namespaced per copy |
| `frontend/src/ui/panels/` | Adjustment panel in layer and image modes (Levels Auto and black, gray and white eyedroppers; Hue/Saturation spectrum band handles, Sample, Add and Remove eyedroppers and targeted adjustment), filter panel, Remove Background panel (Basic and Advanced refine), JPEG export sheet, color picker, Canvas Size, Image Size, the amount dialog, and their control rows |
| `frontend/src/ui/dom.ts` | NodeMode `dom-stable` helpers plus small in-place setters |
| `frontend/src/ui/icons.ts`, `themes.ts` | The 80 icons copied verbatim from NodeMode, the 14 theme profiles |
| `frontend/src/styles/` | NodeMode tokens and the component sheets; `scrollbars.css` loads last |

## Contract

- Render a container once, then patch: `patchList` for keyed lists, `setText`, `setClass`, `setHidden` and the other setters for single values. Never clear and refill.
- Reserve space before content arrives; a node appearing or a label changing must not move its neighbors.
- Colors and z-index come from tokens only. New stacking needs a `--z-*` token in `tokens.css`.
- Icons come from `ui/icons.ts`; no icon libraries.
- Every UI change passes the procedure on [Verification](Verification).
