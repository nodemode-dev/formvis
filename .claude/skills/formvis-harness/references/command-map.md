# Command map

Generated from the window's command catalogue (1325 commands: 8 action, 884 command, 380 option, 53 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 74 | `command-author` | `auto-align-layers`, `auto-blend-layers`, `clean-working-files`, `clear` |
| File | 88 | `io-formats` | `assemble-tiles`, `batch`, `clear-recent`, `close-all` |
| Filter | 86 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Generate | 6 | `command-author` | `boxes-clear`, `boxes-copy`, `boxes-from-selection`, `boxes-tool` |
| Help | 3 | `command-author` | `help-github`, `report-issue`, `simulate-gpu-loss` |
| Image | 99 | `engine-builder` | `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer`, `adj-clarity` |
| Layer | 243 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `align-bottom` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 11 | `tool-builder` | `clipping-path`, `delete-path`, `fill-path`, `fill-path-dialog` |
| Select | 42 | `engine-builder` | `auto-select-sample-all`, `border`, `channel-down`, `channel-options` |
| Tool options | 380 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.pressureCurve`, `tool.options.artHistory.size` |
| Tools | 53 | `tool-builder` | `tool.select.artHistory`, `tool.select.artboard`, `tool.select.backgroundEraser`, `tool.select.boxes` |
| Type | 49 | `tool-builder` | `add-font-files`, `add-web-font`, `character-styles`, `check-spelling` |
| View | 93 | `ui-builder` | `actual`, `clear-guides`, `clear-slices`, `delete-slice` |
| Window | 97 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 435, `filter` 83, `new` 53, `export` 30, `panel` 28, `adj` 27, `layer` 26, `type` 21, `select` 19, `theme` 16, `stack` 14, `proof` 13, `toggle` 13, `transform` 12, `depth` 11, `pick` 11, `style` 11, `delete` 10, `par` 10, `show` 10, `video` 10, `mask` 9, `mode` 9, `arrange` 8, `distribute` 8, `fill` 8, `rasterize` 8, `save` 8, `smart` 8, `vmask` 7, `align` 6, `auto` 6, `clear` 6, `convert` 6, `font` 6, `load` 6, `paste` 6, `snap` 6, `add` 5, `brush` 5
