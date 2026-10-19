# Tool map

Generated from the MCP catalogue (66 tools, `TOOLS` in `backend/app/routers/mcp.py`) and the `formvis-driving` sub-skills by `./formvis agents sync`; do not edit by hand. A tool no sub-skill names reads `none` and needs a line in the sub-skill that covers its family.

| Tool | Reads or changes | Driving sub-skills that name it |
| --- | --- | --- |
| `get_document` | reads only | `adjustments-and-filters`, `colour-and-modes`, `documents-and-files`, `export`, `generation-and-ai`, `layers-and-masks`, `selections`, `terminal`, `transform-and-warp`, `type-and-shapes` |
| `get_image` | reads only | `adjustments-and-filters`, `colour-and-modes`, `documents-and-files`, `export`, `generation-and-ai`, `layers-and-masks`, `painting-and-brushes`, `selections`, `transform-and-warp`, `type-and-shapes` |
| `new_document` | adds or changes | `documents-and-files`, `export`, `generation-and-ai`, `timeline-and-video`, `type-and-shapes` |
| `select` | adds or changes | `adjustments-and-filters`, `generation-and-ai`, `painting-and-brushes`, `selections` |
| `add_layer` | adds or changes | `layers-and-masks`, `painting-and-brushes`, `type-and-shapes` |
| `set_layer` | adds or changes | `adjustments-and-filters`, `generation-and-ai`, `layers-and-masks`, `painting-and-brushes`, `selections`, `type-and-shapes` |
| `delete_layer` | replaces or removes | `layers-and-masks`, `type-and-shapes` |
| `fill` | adds or changes | `layers-and-masks`, `painting-and-brushes`, `selections`, `timeline-and-video`, `transform-and-warp`, `type-and-shapes` |
| `add_adjustment` | adds or changes | `adjustments-and-filters`, `colour-and-modes`, `painting-and-brushes` |
| `place_image` | adds or changes | `colour-and-modes`, `documents-and-files`, `layers-and-masks`, `timeline-and-video`, `transform-and-warp` |
| `undo` | adds or changes | `adjustments-and-filters`, `colour-and-modes`, `documents-and-files`, `export`, `generation-and-ai`, `layers-and-masks`, `painting-and-brushes`, `selections`, `timeline-and-video` |
| `redo` | adds or changes | `documents-and-files` |
| `generative_fill` | adds or changes | `generation-and-ai`, `layers-and-masks`, `painting-and-brushes`, `selections`, `transform-and-warp` |
| `generative_expand` | adds or changes | `generation-and-ai`, `transform-and-warp` |
| `generate_image` | adds or changes | `generation-and-ai`, `layers-and-masks`, `painting-and-brushes`, `type-and-shapes` |
| `upscale` | adds or changes | `documents-and-files`, `generation-and-ai`, `transform-and-warp` |
| `remove_background` | adds or changes | `export`, `generation-and-ai`, `layers-and-masks` |
| `open_file` | adds or changes | `documents-and-files`, `export`, `terminal`, `timeline-and-video`, `type-and-shapes` |
| `save_project` | replaces or removes | `documents-and-files`, `export`, `generation-and-ai`, `layers-and-masks` |
| `export_image` | replaces or removes | `colour-and-modes`, `documents-and-files`, `export`, `generation-and-ai`, `layers-and-masks`, `terminal`, `type-and-shapes` |
| `switch_document` | adds or changes | `documents-and-files`, `selections` |
| `close_document` | replaces or removes | none |
| `ping` | reads only | none |
| `list_plugins` | reads only | none |
| `resize_image` | adds or changes | `export`, `transform-and-warp` |
| `resize_canvas` | adds or changes | `transform-and-warp` |
| `crop` | replaces or removes | `generation-and-ai`, `transform-and-warp` |
| `flip_canvas` | adds or changes | `transform-and-warp` |
| `transform_layer` | adds or changes | `layers-and-masks`, `transform-and-warp`, `type-and-shapes` |
| `rasterize_layer` | adds or changes | `adjustments-and-filters`, `layers-and-masks`, `painting-and-brushes`, `type-and-shapes` |
| `duplicate_layer` | adds or changes | `colour-and-modes`, `layers-and-masks`, `type-and-shapes` |
| `move_layer` | adds or changes | `layers-and-masks`, `painting-and-brushes`, `type-and-shapes` |
| `merge_layers` | replaces or removes | `layers-and-masks` |
| `flatten_image` | replaces or removes | `layers-and-masks` |
| `add_text` | adds or changes | `layers-and-masks`, `painting-and-brushes`, `timeline-and-video`, `type-and-shapes` |
| `draw_shape` | adds or changes | `layers-and-masks`, `painting-and-brushes`, `type-and-shapes` |
| `select_subject` | adds or changes | `adjustments-and-filters`, `generation-and-ai`, `selections` |
| `select_color_range` | adds or changes | `painting-and-brushes`, `selections` |
| `select_feather` | adds or changes | none |
| `select_grow` | adds or changes | none |
| `select_point` | adds or changes | none |
| `apply_filter` | adds or changes | `adjustments-and-filters`, `layers-and-masks`, `painting-and-brushes`, `selections`, `type-and-shapes` |
| `set_adjustment` | adds or changes | `adjustments-and-filters`, `colour-and-modes` |
| `color_match` | adds or changes | `adjustments-and-filters`, `colour-and-modes` |
| `add_film_layer` | adds or changes | `adjustments-and-filters`, `colour-and-modes` |
| `timeline_get` | reads only | `timeline-and-video` |
| `timeline_create` | adds or changes | `timeline-and-video` |
| `timeline_delete` | replaces or removes | `timeline-and-video` |
| `timeline_set` | adds or changes | `timeline-and-video` |
| `timeline_go_to` | adds or changes | `timeline-and-video` |
| `timeline_clip` | adds or changes | `timeline-and-video` |
| `timeline_split` | adds or changes | `timeline-and-video` |
| `timeline_keyframe` | adds or changes | `timeline-and-video` |
| `timeline_transition` | adds or changes | `timeline-and-video` |
| `timeline_frame_image` | reads only | `timeline-and-video` |
| `timeline_render` | replaces or removes | `export`, `timeline-and-video` |
| `list_commands` | reads only | `painting-and-brushes`, `terminal` |
| `describe_command` | reads only | `terminal` |
| `run_command` | replaces or removes | `adjustments-and-filters`, `painting-and-brushes`, `terminal` |
| `run_commands` | replaces or removes | `terminal` |
| `get_selection` | reads only | `documents-and-files` |
| `get_layer_tree` | reads only | `documents-and-files` |
| `select_mask` | adds or changes | none |
| `list_settings` | reads only | none |
| `set_settings` | adds or changes | none |
| `ui_inspect` | reads only | none |
