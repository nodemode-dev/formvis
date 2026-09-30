# What runs on this computer

Every capability formvis gained from the capability plan, and whether it works with no ComfyUI, no fal key and no
internet once its model (if any) is downloaded. "Verified" names the test that proves it; "stand-in" means the test
replaces an outside program or a model too large for the test machine, and says so.

## Entirely local, nothing to install

| Capability | Verified |
|---|---|
| Color Match, film looks (Split Toning, Halation, Glow, Grain presets, Light Leak, Frame) | e2e/test_color_match.py, e2e/test_film_looks.py |
| OpenRaster open and export; Photoshop files; export sizes and the AI label | e2e/test_openraster.py, e2e/test_export_size_label.py |
| Place 3D Model (three.js is part of formvis) | e2e/test_place_3d.py |
| Very large pictures (reduced, region, tiles; Assemble Tiles) | tests/test_large.py, e2e/test_large_picture.py |
| Session restore; API keys in the system's password store; plugins; the MCP server for outside agents | e2e/test_session_restore.py, tests/test_secrets.py, e2e/test_plugins.py, tests/test_mcp.py |
| Quick Content-Aware Fill (Shift+Backspace), computed in formvis with no model | its engine tests |
| Help: the manual and its search (Ask needs a language model, below) | e2e/test_help.py |

## Local once a model is downloaded (Preferences > Plugins > Local models)

| Capability | Model | Runs on | Verified |
|---|---|---|---|
| Generative Fill and Expand, no prompt | LaMa, 208 MB, Apache-2.0 | any computer's CPU (seconds) | real model: tests/test_localgen_inpaint.py, e2e/test_local_inpaint.py (no fal, no ComfyUI) |
| Image > Upscale 2x or 4x | Real-ESRGAN x4plus, 67 MB, BSD-3-Clause | any computer's CPU | real model: tests/test_localgen_upscale.py, e2e/test_local_upscale.py |
| Select Subject | SAM 2 | any computer's CPU | e2e/test_select_subject.py |
| Generative Fill and Expand with a prompt; Generate Image | Krea 2 Turbo (up to 18 GB) or FLUX.2 [klein] 4B | Apple silicon (mflux); Krea 2 also Windows or Linux with an NVIDIA GPU (diffusers) | stand-in model: tests/test_localgen_krea2.py, tests/test_localgen_fill.py, e2e/test_local_generation.py. A real run is not verified: the test machine has neither |

## Local with a program of your own

| Capability | Needs | Verified |
|---|---|---|
| Improve Prompt, the assistant, Help's Ask | a language model server on this computer (Ollama or LM Studio; any OpenAI-compatible address) | stand-in model: tests/test_llm.py, e2e/test_assistant.py, e2e/test_help.py |
| Send to NodeMode | NodeMode running on this computer | stand-in: tests/test_nodemode.py |
| Send to ComfyUI, Run ComfyUI Workflow, ComfyUI workflows as models | ComfyUI (that is what they are for) | stand-in: tests/test_comfyui.py |

## Not local yet

- Reference layers go only to ComfyUI workflows; LaMa and Krea 2 do not take them.
- Prompted generation on a computer with neither Apple silicon nor an NVIDIA GPU: LaMa fills without a prompt there.
  A diffusers-layout ONNX folder dropped into the models folder is listed in Generate Image (formcut's local
  diffusion runner), but no such model is offered for download and none is verified.
