# What runs on this computer

Every capability formvis gained from the capability plan, and whether it works with no ComfyUI, no fal key and no
internet once its model (if any) is downloaded. "Verified" names the test that proves it; "stand-in" means the test
replaces an outside program or a model too large for the test machine, and says so.

## Entirely local, nothing to install

| Capability | Verified |
|---|---|
| Color Match, film looks (Split Toning, Halation, Glow, Grain presets, Light Leak, Frame) | e2e/test_color_match.py, e2e/test_film_looks.py |
| OpenRaster open and export; PSD files; export sizes and the AI label | e2e/test_openraster.py, e2e/test_export_size_label.py |
| Place 3D Model (three.js is part of formvis) | e2e/test_place_3d.py |
| Very large pictures (reduced, region, tiles; Assemble Tiles) | tests/test_large.py, e2e/test_large_picture.py |
| Session restore; API keys in the system's password store; plugins; the MCP server for outside agents | e2e/test_session_restore.py, tests/test_secrets.py, e2e/test_plugins.py, tests/test_mcp.py |
| Quick Content-Aware Fill (Shift+Backspace), computed in formvis with no model | its engine tests |
| Help: the manual and its search (Ask needs a language model, below) | e2e/test_help.py |

## Local once a model is downloaded (Preferences > Plugins > Local models)

| Capability | Model | Runs on | Verified |
|---|---|---|---|
| Generative Fill and Expand, no prompt | LaMa, 208 MB, Apache-2.0 | any computer's CPU (seconds) | real model: tests/test_localgen_inpaint.py, e2e/test_local_inpaint.py (no fal, no ComfyUI) |
| Neural Filters > Depth Blur | Depth Anything V2 Small (ONNX), 99 MB, Apache-2.0 | any computer's CPU (about 2 s a picture) | real model run here on 1 October 2026 (a near object 203, a far sky 85); the browser run under throttling in frontend/HASHOUT_LOG.md 1.54.8 |
| Neural Filters > Colorize | DDColor-tiny (ONNX, fp16 weights), 135 MB, Apache-2.0 | any computer's CPU (about 6 s a picture) | real model run here on 1 October 2026 on a grey photograph (a plausible sky, water and sand; luminance kept within 0.9); the browser run under throttling in frontend/HASHOUT_LOG.md 1.54.9 |
| Neural Filters > Style Transfer | five fast neural style presets (ONNX model zoo), 34 MB, BSD-3-Clause; the fixed 224 by 224 input made dynamic in memory (the onnx package, Apache-2.0) | any computer's CPU (about 1.5 s at 640 px) | real models run here on 1 October 2026 on a photograph (looked at: Mosaic is a stained-glass rendering); the browser run under throttling in frontend/HASHOUT_LOG.md 1.55.1 |
| Liquify > Face-Aware Liquify | YuNet face finder (OpenCV Zoo, ONNX), 232 KB, MIT, run by OpenCV | any computer's CPU (0.2 s a picture) | real model run here on 1 October 2026 on a public-domain portrait (one face, its five landmarks looked at); the browser run under throttling in frontend/HASHOUT_LOG.md 1.56.7 |
| Select > Sky | sky segmenter (xiongzhu666's U-2-Net, ONNX), 176 MB, MIT | any computer's CPU (about 1 s a picture) | real model run here on 1 October 2026 on a public-domain NASA picture (the sky taken, the rocket, towers and ground not, looked at); the browser run under throttling in frontend/HASHOUT_LOG.md 1.57.6 |
| Image > Upscale 2x or 4x | Real-ESRGAN x4plus, 67 MB, BSD-3-Clause | any computer's CPU | real model: tests/test_localgen_upscale.py, e2e/test_local_upscale.py |
| Object Selection | SAM 2.1 tiny, 155 MB, Apache-2.0, fetched on first use | any computer's CPU (ONNX Runtime; torch on a GPU when installed) | real model: tests/test_segment_onnx.py |
| Select Subject and Remove Background | U²-Net, 176 MB, Apache-2.0, fetched on first use | any computer's CPU (ONNX Runtime; rembg when installed) | real model: tests/test_background_onnx.py, e2e/test_select_subject.py |
| Generative Fill and Expand with a prompt; Generate Image | Krea 2 Turbo (up to 18 GB) or FLUX.2 [klein] 4B | Apple silicon (mflux); Krea 2 also Windows or Linux with an NVIDIA GPU (diffusers) | stand-in model: tests/test_localgen_krea2.py, tests/test_localgen_fill.py, e2e/test_local_generation.py. A real run is not verified: the test machine has neither |

## Local with a program of your own

| Capability | Needs | Verified |
|---|---|---|
| Improve Prompt, the assistant, Help's Ask | a language model server on this computer (Ollama or LM Studio; any OpenAI-compatible address) | stand-in model: tests/test_llm.py, e2e/test_assistant.py, e2e/test_help.py |
| Send to NodeMode | NodeMode running on this computer | stand-in: tests/test_nodemode.py |
| Editing by asking, from Claude Code, Codex or Cursor | the client; formvis's side (the MCP server, its 134 tools, the window) runs here, the agent's own model wherever its provider runs it | the real engine and window, an agent's part played: e2e/test_agent_editing.py, e2e/test_agent_consent.py, tests/test_mcp.py, tests/test_agents_setup.py |
| Send to ComfyUI, Run ComfyUI Workflow, ComfyUI workflows as models | ComfyUI (that is what they are for) | stand-in: tests/test_comfyui.py |

## Not local yet

- Reference layers go only to ComfyUI workflows; LaMa and Krea 2 do not take them.
- Prompted generation on a computer with neither Apple silicon nor an NVIDIA GPU: LaMa fills without a prompt there.
  A diffusers-layout ONNX folder dropped into the models folder is listed in Generate Image (formcut's local
  diffusion runner), but no such model is offered for download and none is verified.
