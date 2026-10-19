# Command map

Generated from the window's command catalogue (1001 commands: 8 action, 710 command, 232 option, 51 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 60 | `command-author` | `auto-align-layers`, `auto-blend-layers`, `clear`, `colour.settings` |
| File | 74 | `io-formats` | `assemble-tiles`, `batch`, `clear-recent`, `close-all` |
| Filter | 81 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Generate | 2 | `command-author` | `generate-panel`, `generate-remove` |
| Image | 89 | `engine-builder` | `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer`, `adj-clarity` |
| Layer | 229 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `align-bottom` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 8 | `tool-builder` | `delete-path`, `fill-path`, `fill-path-dialog`, `new-path` |
| Select | 35 | `engine-builder` | `border`, `channel-down`, `channel-options`, `channel-up` |
| Tool options | 232 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.size`, `tool.options.artHistory.style` |
| Tools | 51 | `tool-builder` | `tool.select.artHistory`, `tool.select.artboard`, `tool.select.backgroundEraser`, `tool.select.brush` |
| Type | 22 | `tool-builder` | `character-styles`, `check-spelling`, `convert-paragraph-text`, `convert-point-text` |
| View | 44 | `ui-builder` | `actual`, `clear-guides`, `clear-slices`, `delete-slice` |
| Window | 73 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 285, `filter` 78, `new` 45, `adj` 27, `panel` 25, `export` 24, `layer` 24, `select` 16, `stack` 14, `style` 11, `transform` 11, `pick` 10, `proof` 10, `video` 10, `delete` 9, `par` 9, `toggle` 9, `distribute` 8, `mode` 8, `smart` 8, `mask` 7, `rasterize` 7, `vmask` 7, `align` 6, `arrange` 6, `paste` 6, `save` 6, `type` 6, `auto` 5, `clear` 5, `convert` 5, `edit` 5, `fill` 5, `font` 5, `load` 5, `measure` 5, `script` 5, `shapes` 5, `warp` 5, `close` 4
