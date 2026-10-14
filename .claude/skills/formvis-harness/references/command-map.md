# Command map

Generated from the window's command catalogue (890 commands: 7 action, 609 command, 225 option, 49 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 58 | `command-author` | `auto-align-layers`, `auto-blend-layers`, `clear`, `colour.settings` |
| File | 73 | `io-formats` | `assemble-tiles`, `batch`, `clear-recent`, `close-all` |
| Filter | 80 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Image | 79 | `engine-builder` | `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer`, `adj-clarity` |
| Layer | 190 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `align-bottom` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 8 | `tool-builder` | `delete-path`, `fill-path`, `fill-path-dialog`, `new-path` |
| Select | 28 | `engine-builder` | `border`, `color-range`, `contract`, `convert-to-shape` |
| Tool options | 225 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.size`, `tool.options.artHistory.style` |
| Tools | 49 | `tool-builder` | `tool.select.artHistory`, `tool.select.backgroundEraser`, `tool.select.brush`, `tool.select.bucket` |
| Type | 11 | `tool-builder` | `convert-paragraph-text`, `convert-point-text`, `edit-text`, `find-replace-text` |
| View | 33 | `ui-builder` | `actual`, `clear-guides`, `clear-slices`, `fit` |
| Window | 55 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 276, `filter` 77, `new` 42, `adj` 27, `export` 24, `layer` 15, `stack` 14, `panel` 13, `style` 11, `transform` 11, `proof` 10, `select` 10, `video` 9, `distribute` 8, `mode` 8, `toggle` 8, `delete` 7, `mask` 7, `rasterize` 7, `smart` 7, `align` 6, `arrange` 6, `paste` 6, `save` 6, `vmask` 6, `auto` 5, `clear` 5, `convert` 5, `fill` 5, `shapes` 5, `warp` 5, `close` 4, `copy` 4, `edit` 4, `flip` 4, `match` 4, `matting` 4, `measure` 4, `merge` 4, `rotate` 4
