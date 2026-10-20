# Command map

Generated from the window's command catalogue (1616 commands: 8 action, 1088 command, 467 option, 53 tool) by `./formvis agents sync`; do not edit by hand.

Every command is registered in `frontend/src/app.ts` (hand-written), `frontend/src/automation/catalogue.ts` (`tool.select.*`, `tool.options.*` and the seven actions) or by a plug-in; its words are in `frontend/src/automation/command-meta.ts`. A command with no words is reported missing and `./formvis counts --commands --check` fails.

| Group | Commands | Harness sub-skill | First ids |
| --- | --- | --- | --- |
| Edit | 108 | `command-author` | `apply-edit`, `auto-align-layers`, `auto-blend-layers`, `cancel-edit` |
| File | 102 | `io-formats` | `action-options`, `assemble-tiles`, `batch`, `clear-recent` |
| Filter | 93 | `filter-library` | `bump-map`, `filter-addNoise`, `filter-average`, `filter-blur` |
| Generate | 6 | `command-author` | `boxes-clear`, `boxes-copy`, `boxes-from-selection`, `boxes-tool` |
| Help | 5 | `command-author` | `copy-frame-trace`, `frame-trace`, `help-github`, `report-issue` |
| Image | 122 | `engine-builder` | `adj-addNoise`, `adj-blackWhite`, `adj-brightnessContrast`, `adj-channelMixer` |
| Layer | 282 | `engine-builder` | `add-filter-mask`, `add-mask`, `add-mask-hide`, `ai-label-add` |
| Paint | 1 | `brush-engine` | `paint.stroke` |
| Paths | 12 | `tool-builder` | `clipping-path`, `delete-path`, `fill-path`, `fill-path-dialog` |
| Select | 46 | `engine-builder` | `auto-select-sample-all`, `border`, `channel-down`, `channel-options` |
| Tool options | 467 | `tool-builder` | `tool.options.artHistory.hardness`, `tool.options.artHistory.maskPaint`, `tool.options.artHistory.opacity`, `tool.options.artHistory.pressureCurve` |
| Tools | 53 | `tool-builder` | `tool.select.artHistory`, `tool.select.artboard`, `tool.select.backgroundEraser`, `tool.select.boxes` |
| Type | 66 | `tool-builder` | `add-font-files`, `add-web-font`, `character-styles`, `check-spelling` |
| View | 102 | `ui-builder` | `actual`, `canvas-scrollbars`, `clear-artboard-guides`, `clear-guides` |
| Window | 151 | `ui-builder` | `about`, `action-stop`, `actions`, `agent.chat` |

## Id families

`tool` 522, `filter` 85, `new` 62, `layer` 40, `panel` 37, `type` 37, `adj` 33, `export` 31, `theme` 29, `select` 21, `prefs` 16, `show` 16, `stack` 14, `transform` 14, `proof` 13, `toggle` 13, `arrange` 12, `delete` 12, `depth` 12, `video` 12, `mask` 11, `pick` 11, `style` 11, `mode` 10, `par` 10, `save` 10, `copy` 9, `measure` 9, `smart` 9, `distribute` 8, `fill` 8, `rasterize` 8, `snap` 8, `clear` 7, `edit` 7, `load` 7, `paste` 7, `vmask` 7, `align` 6, `auto` 6
