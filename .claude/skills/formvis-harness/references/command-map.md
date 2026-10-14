# Command map

Generated from the window's command catalogue (806 commands: 7 action, 526 command, 225 option, 48 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 49 | `command-author` | `auto-align-layers`, `auto-blend-layers`, `clear`, `colour.settings` |
| File | 55 | `io-formats` | `assemble-tiles`, `batch`, `clear-recent`, `close-all` |
| Filter | 77 | `filter-library` | `filter-addNoise`, `filter-average`, `filter-blur`, `filter-blurMore` |
| Image | 73 | `engine-builder` | `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer`, `adj-clarity` |
| Layer | 167 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `align-bottom` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 8 | `tool-builder` | `delete-path`, `fill-path`, `fill-path-dialog`, `new-path` |
| Select | 28 | `engine-builder` | `border`, `color-range`, `contract`, `convert-to-shape` |
| Tool options | 225 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.size`, `tool.options.artHistory.style` |
| Tools | 48 | `tool-builder` | `tool.select.artHistory`, `tool.select.backgroundEraser`, `tool.select.brush`, `tool.select.bucket` |
| Type | 4 | `tool-builder` | `edit-text`, `paragraph-styles`, `type-on-path`, `warp-text` |
| View | 29 | `ui-builder` | `actual`, `clear-guides`, `fit`, `gamut-warning` |
| Window | 42 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 273, `filter` 77, `new` 42, `adj` 27, `export` 19, `layer` 15, `panel` 13, `style` 11, `transform` 11, `proof` 10, `select` 10, `distribute` 8, `delete` 7, `mask` 7, `mode` 7, `rasterize` 7, `toggle` 7, `align` 6, `smart` 6, `vmask` 6, `auto` 5, `fill` 5, `paste` 5, `save` 5, `shapes` 5, `clear` 4, `copy` 4, `edit` 4, `flip` 4, `matting` 4, `merge` 4, `rotate` 4, `screen` 4, `send` 4, `add` 3, `apply` 3, `artboard` 3, `close` 3, `content` 3, `convert` 3
