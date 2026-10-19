# Command map

Generated from the window's command catalogue (1106 commands: 8 action, 778 command, 269 option, 51 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 67 | `command-author` | `auto-align-layers`, `auto-blend-layers`, `clean-working-files`, `clear` |
| File | 79 | `io-formats` | `assemble-tiles`, `batch`, `clear-recent`, `close-all` |
| Filter | 86 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Generate | 2 | `command-author` | `generate-panel`, `generate-remove` |
| Help | 3 | `command-author` | `help-github`, `report-issue`, `simulate-gpu-loss` |
| Image | 88 | `engine-builder` | `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer`, `adj-clarity` |
| Layer | 234 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `align-bottom` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 9 | `tool-builder` | `clipping-path`, `delete-path`, `fill-path`, `fill-path-dialog` |
| Select | 35 | `engine-builder` | `border`, `channel-down`, `channel-options`, `channel-up` |
| Tool options | 269 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.pressureCurve`, `tool.options.artHistory.size` |
| Tools | 51 | `tool-builder` | `tool.select.artHistory`, `tool.select.artboard`, `tool.select.backgroundEraser`, `tool.select.brush` |
| Type | 26 | `tool-builder` | `add-font-files`, `add-web-font`, `character-styles`, `check-spelling` |
| View | 68 | `ui-builder` | `actual`, `clear-guides`, `clear-slices`, `delete-slice` |
| Window | 88 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 322, `filter` 83, `new` 46, `panel` 28, `adj` 27, `export` 25, `layer` 24, `select` 16, `stack` 14, `transform` 12, `pick` 11, `proof` 11, `style` 11, `toggle` 11, `delete` 10, `video` 10, `mask` 9, `par` 9, `arrange` 8, `distribute` 8, `mode` 8, `smart` 8, `rasterize` 7, `save` 7, `show` 7, `vmask` 7, `align` 6, `clear` 6, `font` 6, `load` 6, `paste` 6, `snap` 6, `type` 6, `add` 5, `auto` 5, `convert` 5, `edit` 5, `fill` 5, `measure` 5, `pasteboard` 5
