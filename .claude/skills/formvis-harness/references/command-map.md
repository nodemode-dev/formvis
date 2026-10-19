# Command map

Generated from the window's command catalogue (1531 commands: 8 action, 1032 command, 438 option, 53 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 102 | `command-author` | `apply-edit`, `auto-align-layers`, `auto-blend-layers`, `cancel-edit` |
| File | 99 | `io-formats` | `action-options`, `assemble-tiles`, `batch`, `clear-recent` |
| Filter | 92 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Generate | 6 | `command-author` | `boxes-clear`, `boxes-copy`, `boxes-from-selection`, `boxes-tool` |
| Help | 5 | `command-author` | `copy-frame-trace`, `frame-trace`, `help-github`, `report-issue` |
| Image | 113 | `engine-builder` | `adj-addNoise`, `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer` |
| Layer | 265 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `ai-label-add` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 11 | `tool-builder` | `clipping-path`, `delete-path`, `fill-path`, `fill-path-dialog` |
| Select | 43 | `engine-builder` | `auto-select-sample-all`, `border`, `channel-down`, `channel-options` |
| Tool options | 438 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.opacity`, `tool.options.artHistory.pressureCurve`, `tool.options.artHistory.pressureOpacity` |
| Tools | 53 | `tool-builder` | `tool.select.artHistory`, `tool.select.artboard`, `tool.select.backgroundEraser`, `tool.select.boxes` |
| Type | 59 | `tool-builder` | `add-font-files`, `add-web-font`, `character-styles`, `check-spelling` |
| View | 98 | `ui-builder` | `actual`, `canvas-scrollbars`, `clear-artboard-guides`, `clear-guides` |
| Window | 146 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.claude.open` |

## Id families

`tool` 493, `filter` 84, `new` 59, `panel` 34, `adj` 32, `export` 31, `type` 31, `layer` 29, `theme` 29, `select` 19, `prefs` 16, `show` 16, `stack` 14, `proof` 13, `toggle` 13, `arrange` 12, `delete` 12, `transform` 12, `depth` 11, `mask` 11, `pick` 11, `style` 11, `video` 11, `mode` 10, `par` 10, `save` 9, `smart` 9, `copy` 8, `distribute` 8, `fill` 8, `measure` 8, `rasterize` 8, `clear` 7, `edit` 7, `load` 7, `paste` 7, `snap` 7, `vmask` 7, `align` 6, `auto` 6
