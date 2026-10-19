# Tool map

Generated from the MCP catalogue (134 tools, `TOOLS` in `backend/app/routers/mcp.py`) and the `formvis-driving` sub-skills by `./formvis agents sync`; do not edit by hand. A tool no sub-skill names reads `none` and needs a line in the sub-skill that covers its family.

## Contents

- Tools: each MCP tool, whether it reads or changes, and the driving sub-skills that name it

## Tools

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
| `command_job` | reads only | none |
| `run_commands` | replaces or removes | `terminal` |
| `get_selection` | reads only | `documents-and-files` |
| `get_layer_tree` | reads only | `documents-and-files` |
| `select_mask` | adds or changes | none |
| `list_settings` | reads only | none |
| `list_fonts` | reads only | none |
| `file_info` | reads only | none |
| `convert_file` | replaces or removes | none |
| `jobs_list` | reads only | none |
| `jobs_cancel` | replaces or removes | none |
| `set_settings` | adds or changes | none |
| `ui_inspect` | reads only | none |
| `ui_state` | reads only | none |
| `ui_screenshot` | reads only | none |
| `ui_menu_list` | reads only | none |
| `ui_menu_invoke` | replaces or removes | none |
| `ui_set` | adds or changes | none |
| `ui_dialog` | adds or changes | none |
| `ui_pointer` | replaces or removes | none |
| `ui_key` | replaces or removes | none |
| `ui_window` | adds or changes | none |
| `control_call` | replaces or removes | none |
| `file_roots` | reads only | none |
| `boxes_list` | reads only | none |
| `boxes_add` | adds or changes | none |
| `boxes_set` | adds or changes | none |
| `boxes_remove` | replaces or removes | none |
| `boxes_from_selection` | adds or changes | none |
| `boxes_clear` | replaces or removes | none |
| `sample_box` | reads only | none |
| `frequency_separation` | adds or changes | none |
| `sample_depth` | reads only | none |
| `depth_edit` | adds or changes | none |
| `set_crop` | replaces or removes | none |
| `export_mask` | replaces or removes | none |
| `list_recipes` | reads only | none |
| `set_active_layer` | adds or changes | none |
| `select_color` | adds or changes | none |
| `select_shape` | adds or changes | none |
| `select_range` | adds or changes | none |
| `sample_mean_color` | reads only | none |
| `align_layers` | adds or changes | none |
| `group_layers` | adds or changes | none |
| `set_group` | adds or changes | none |
| `set_mask` | replaces or removes | none |
| `set_text` | adds or changes | none |
| `list_history` | reads only | none |
| `take_snapshot` | adds or changes | none |
| `restore_snapshot` | adds or changes | none |
| `delete_snapshot` | replaces or removes | none |
| `extend_canvas` | adds or changes | none |
| `export_layer` | replaces or removes | none |
| `read_log` | reads only | none |
| `list_brush_tips` | reads only | none |
| `set_brush` | adds or changes | none |
| `add_filter` | adds or changes | none |
| `set_filter` | replaces or removes | none |
| `apply_preset` | adds or changes | none |
| `depth_from_layer` | adds or changes | none |
| `match_edges` | adds or changes | none |
| `realism_pass` | adds or changes | none |
| `compare` | reads only | none |
| `set_status` | adds or changes | none |
| `ailabel_add` | adds or changes | none |
| `ailabel_remove` | replaces or removes | none |
| `ailabel_info` | reads only | none |
| `film_looks` | reads only | none |
| `film_apply_look` | adds or changes | none |
| `film_add_point` | adds or changes | none |
| `film_copy_points` | reads only | none |
| `film_paste_points` | adds or changes | none |
| `glb_place` | adds or changes | none |
| `glb_edit` | adds or changes | none |
| `glb_info` | reads only | none |
