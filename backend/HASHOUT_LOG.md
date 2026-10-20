# backend HASHOUT_LOG

Living log for the engine service side, _v0.1.0. Read the map and the TOC first; entries are anchored by file and symbol, and removed code is quoted in full.

## Exact MP4 rate, 16-bit and RGB streamed TIFF · _v1.92.6 (app/routers/video.py, app/routers/bands.py)

- video: `_rate(fps)` gives an exact rational (n*1000/1001 for the 24/30/60 NTSC rates, otherwise Fraction(...).limit_denominator(1000)); `_encode(fps_in)` fixes the rate with one repeat per frame when the window sends `fps`, and the old delay grid still applies without it. 12 fps had become 1000/83.
- bands: `/api/bands/tiff` takes `depth` (8 or 16) and `alpha`; row bytes are `w * spp * depth/8`, 16-bit samples little-endian to match the "II" header. ExtraSamples (338) only with alpha, since readers treat RGB with it as unexpected. Removed `(258, 3, 4, struct.pack("<4H", 8, 8, 8, 8))`, `(277, 3, 1, struct.pack("<H", 4))`, `step = s["rps"] * s["w"] * 4`, `"rps": max(1, STRIP // (width * 4))` and `row = s["w"] * 4`. Parallel band deflate showed no speedup on the shared 2-core box.

## ComfyUI upscaler routes · _v1.92.4 (app/routers/comfyui.py)

- GET /api/comfyui/upscale-models lists ComfyUI's UpscaleModelLoader files and any missing nodes; POST /api/comfyui/upscale builds LoadImage, UpscaleModelLoader, ImageUpscaleWithModel and SaveImage and reuses run(), so progress, cancel and image fetch are unchanged. The model name must be in ComfyUI's own list, so no path reaches the graph.

## ComfyUI re-upload only what was lost · _v1.92.3 (app/routers/comfyui.py; tests/comfy_mock.py)

- The reupload route checks ComfyUI's /view?type=input for each mirrored picture (_held) and sends only the ones it no longer holds byte for byte; it answers `present` beside `sent` and `missing`. A failed check counts as not held, so it falls back to uploading.
- tests/comfy_mock.py is a stand-in ComfyUI (HTTP routes plus a hand-written /ws, since the stdlib server cannot share a port with a websocket server) that runs LoadImage, Invert, Blend, KSampler and SaveImage on real pixels and forgets its inputs on restart().

## Crop and Straighten Photos colour order and refusal · _v1.92.1 (app/routers/merge.py)

- `_read` returns OpenCV's BGR array and crop_photos warped it and saved it as RGB, so red and blue swapped; the cut-out is reversed to RGB before Pillow. Removed `Image.fromarray(warped).save(buf, "PNG")`.
- Pillow's UnidentifiedImageError is an OSError, so a file that is not an image gave a 500; the /photos route now catches (ValueError, OSError) and answers 422. Removed `except ValueError as exc:` at that route.

## One cloud provider by design: other providers declined and guarded · _v1.88.3 (setup/line_counts.py, CLAUDE.md, .claude/skills/formvis-harness/SKILL.md)

The owner's P23 decisions: fal is the one cloud provider; Replicate, WaveSpeedAI, Comfy Cloud, Comfy Router, the Comfy Partner API, OpenRouter for images, ToAPIs, BytePlus ModelArk, Oxen.ai, Magnific and a WaveSpeedAI assistant provider are declined, as Content-Aware Scale was; the named hosted models are deferred until his own fal integration (he has the schemas).

- `line_counts.py` `PROVIDERS_DECLINED` (replicate.com, api.replicate, wavespeed, cloud.comfy.org, comfy cloud, router or partner, toapis, byteplus, modelark, oxen.ai, magnific, freepik) checked in `declined_problems()` beside the patent pattern; the language-model chat's OpenAI-compatible services are not named by it. Checked on a scratch clone: an api.replicate.com line in a backend file gave the problem; the real tree passes (the code already holds fal alone: `localgen/providers.py` `PROVIDERS = {"fal": ...}`). Harness law 11 and `CLAUDE.md` say the same.
- Before promising a balance check or cost display: fal's `GET https://api.fal.ai/v1/account/billing?expand=credits` returns the credit balance and currency to a key with the `billing:usage:read` permission, and `GET https://api.fal.ai/v1/models/pricing?endpoint_id=...` a model's unit price; usage line items and estimates are documented without paths in the pricing page, so check the Platform APIs reference when the integration is built.

## Control roles to ComfyUI, native tables · _v1.91.7 (app/routers/comfyui.py, native/formvis-render, src-tauri/src/native.rs, src-tauri/src/main.rs)

- `_fill` fills LoadImage nodes titled "formvis control <role>" from the control uploads and leaves them out of the main-picture candidates.
- native/formvis-render: sep() cases 27 to 29, source quantisation from mode 27 as the web shader does, mode 101 reading a 2704 x 52 RGBA8 table with textureLoad at integer nodes; `native_table3` in the shell takes 52 x 52 x 52 x 4 raw bytes with an x-id header.

## Streamed chat and improve_prompt · _v1.91.6 (app/services/llm.py, app/routers/llm.py, app/routers/mcp.py, setup/agents.py)

- `POST /api/llm/chat/stream` forwards the slot's stream (stream true with include_usage), joins tool-call fragments by index and ends with a done event shaped like /chat's reply; a 400 or 422 to stream, or a reply that is not an event stream, is retried once without streaming.
- improve_prompt resolves a template against the three starters (STARTER_TEMPLATES, a copy of the page's STARTERS: keep them in step) and the data folder's prompt-templates Markdown; the page's own kept templates live in the browser and are not reachable from the engine.

## Shell crash page · _v1.91.5 (src-tauri/src/window_state.rs, src-tauri/src/main.rs)

- Policy: the first renderer stop reloads; a second within 120 s loads a plain page with `formvis-shell://restart` and `formvis-shell://quit` links, caught in on_navigation (renderer_choice opens the exit gate, since the dead page cannot answer the unsaved-documents prompt). macOS uses on_web_content_process_terminate (Tauri exposes it there only). Checked by cargo check for Linux and aarch64-apple-darwin; not run. Removed: `const CRASH_RELOADS: usize = 2;`, `const CRASH_WINDOW: Duration = Duration::from_secs(60);` and `give_up`, whose dialog read "The window's web view stopped twice within a minute, so formvis has left it as it is. Save what you can, close formvis and open it again; unsaved pictures are offered back when it starts."

## Window jobs over MCP, assets beside the document · _v1.91.4 (app/routers/mcp.py, app/routers/io.py, native/formvis-kernels)

- jobs_list asks a live, allowed window for its jobs (`__jobs`, 5 s) and lists them first; jobs_cancel with all or a `window:` id asks `__job_stop`. A window that does not answer leaves its rows out.
- `POST /io/export-beside` writes Generator assets atomically into a folder beside the document; it requires the X-Formvis header and validates the document path, file and folder names.
- native/formvis-kernels gains the `patch` feature (insideDistance, scaleHealCorrection).

## Window change notices · _v1.91.3 (app/routers/mcp.py, native/formvis-kernels)

- `POST /api/mcp/bridge/changed` takes kinds only (selection, history, layers, document) and marks the matching resources for subscribed sessions: selection marks selection; history marks document, layers, selection and history; layers marks document and layers; document marks document, layers and history.
- native/formvis-kernels gains the `noise` feature (fv_noise_uniform), built with `RUSTFLAGS="-C target-feature=+simd128" cargo build --release --offline --target wasm32-unknown-unknown --no-default-features --features noise`.

## Matting files, depth detail, select_by_depth · _v1.91.2 (app/services/background.py, app/routers/ops.py, app/localgen/depth.py, app/routers/mcp.py)

- Matting file contract: input 1x3xHxW (a fixed size used as is, a dynamic one at 1024), ImageNet normalisation, first output squeezed to 2D, a sigmoid when values leave 0 to 1, resized to the picture. Refusals are 422 with the reason; the folder takes bare names only. `GET /api/ops/matting-models` lists the files.
- Depth detail: DETAIL_SIZE 770 (55 times the 14 px patch); a model with a fixed input answers 422 "does not accept the detail size; use standard". Not run on the real model here.
- MCP tool select_by_depth (near, far, feather, combine, quality).
- An agent's fal image-input endpoint for Generate Image references was reverted by the lead before release (named hosted models wait for the owner's fal integration); `generative.generate` is as in 1.91.1.

## MCP subscriptions, ONNX upscalers, giant projects, recent documents in the shell · _v1.91.1 (app/routers/mcp.py, app/services/agents.py, app/localgen/ai_upscale.py, app/services/project_format.py, src-tauri/src/main.rs, src-tauri/Cargo.toml, src-tauri/Cargo.lock, build_app)

- MCP subscriptions: the transport has no server push, so a session opts in by opening GET /mcp as an event stream; each subscribed session holds a set of changed uris and an event, so notifications coalesce. Changes are announced after a tool call through MCP (mutating tools mark document, layers, selection and history; any call marks jobs; plug-in tools mark plugins); edits made by hand in the window do not notify yet. initialize now reports resources {subscribe: true}; server/discover is unchanged.
- Upscalers: `<models>/upscalers` takes bare file names only; the factor is learned by running a 32 by 32 zero tile; fixed-size or non 1x3xHxW inputs are refused with a reason; .pth, .pt and .safetensors are listed as not loadable (no PyTorch loader).
- project_format.validate(): GIANT_SIDE 300,000 applies only when a layer record carries a `tiled` object; otherwise the old MAX_SIDE.
- note_recent_document: GTK and AppKit calls go through run_on_main_thread; SHAddToRecentDocs is thread-safe. objc2-app-kit and objc2-foundation have default features off because the defaults would add seven packages to Cargo.lock. Checked with `cargo check --locked` for Linux and for aarch64-apple-darwin (the latter with a stub C compiler for objc2-exception-helper's build script, so the Objective-C helper itself was not compiled); Windows unchecked.
- build_app prints the version from tauri.conf.json and the folder first: the owner's failing log for 1.91.0 showed `formvis@1.90.9` and engine 1.90.9, the tree before the window_state.rs fix.

## Parts spool drop, HEIF and AVIF metadata, ComfyUI mirror, improver references, the shell compiles · _v1.91.0 (app/routers/bands.py, app/services/imaging.py, app/routers/mcp.py, app/routers/comfyui.py, app/routers/llm.py, app/services/llm.py, src-tauri/src/window_state.rs)

- `DELETE /api/bands/psdl/{key}` (`_psdl_drop`) frees a stopped or failed layered export's spools; before, they stayed until the engine restarted.
- `source_meta` and `_kept_meta` carry EXIF and XMP into AVIF; Orientation is set to 1 because decode already applied exif_transpose and the writer turns Orientation into a rotation box.
- ComfyUI: `/api/comfyui/mirror` and `/reupload` keep a copy of each input so a restarted ComfyUI gets it again. The prompt improver passes reference images to the model.
- window_state.rs flush: the borrowed lock guard outlived its value (E0597); the statement now ends with `};`. `cargo check --locked` passes for src-tauri, formvis-render and formvis-kernels on Linux; Windows and macOS branches are unchecked.

## Packaged MCP and agents launcher, the real port, Chat tab trust, layered PSD parts, plug-in permissions and MCP resources · _v1.90.9 (formvis_engine.py, setup/mcp_stdio.py, setup/agents.py, setup/freeze_backend, setup/freeze_backend.bat, app/routers/mcp.py, app/routers/claude_code.py, app/services/claude_code.py, app/routers/bands.py, app/routers/plugins.py, src-tauri/src/packaged.rs, src-tauri/src/integration.rs, src-tauri/src/window_state.rs, src-tauri/src/main.rs, src-tauri/build.rs, src-tauri/capabilities/default.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock)

- The desktop engine binds port 0, so an MCP client cannot guess it: `formvis_engine.py` runs `uvicorn.Server` and writes `engine.port` ({pid, port}) in the data folder once bound, removing it at exit (exit code 3 on a failed start); `mcp` and `agents` subcommands run the packaged `setup/mcp_stdio.py` and `setup/agents.py` (both added as PyInstaller data under `setup`), and a missing engine is started from `FORMVIS_LAUNCHER` (the AppImage or app bundle). `agents.py` registers the repository `./formvis` when present, else `FORMVIS_LAUNCHER`, else `APPIMAGE`. Rust (not built here): `packaged.rs` hands `mcp` and `agents` to the sidecar and adds `--add-launcher` and `--remove-launcher`; `integration.rs` writes the AppImage desktop entry once asked; `window_state.rs` keeps geometry and maximised state, the `ui_zoom` command, and on Linux reloads a web view whose renderer died (WebKitGTK's own signal, at most twice a minute, then a dialog); `webkit2gtk` 2 with v2_20 for Linux only (MIT, already in NOTICE through the shell).
- `mcp.py` status and registration use the request's socket port and `FORMVIS_LAUNCHER`; resources `formvis://plugins` and `formvis://history` and the template `formvis://command/{id}`. The Chat agent (`claude_code.start`) gets the in-app MCP configuration with `--strict-mcp-config` and `FORMVIS_INAPP_TOKEN` in the child environment only when the port is known (the repository `.mcp.json` would shadow the in-app server); no `--allowedTools`, so plan mode and the Allow and Deny cards still hold.
- `bands.py` layered PSD and PSB written from band uploads under `/api/bands/psdl` (uncompressed channels, four spools per layer joined behind the records; a PSD over 4 GB is refused with 413) and the flat route's side limit raised to a PSB's 300,000 px. Measured: 40,000 by 2,000 with two layers and a merged picture, 747 MB file at 102 MB peak in 5.4 s; psd-tools reads it.
- `plugins.py` permissions gain `formats` and `frames`.
- Removed, quoted exactly: `"endpoint": "http://127.0.0.1:8190/mcp"`; `launcher = str(config.REPO_DIR / ("formvis.bat" if os.name == "nt" else "formvis"))`; `url = f"http://127.0.0.1:{config.BACKEND_PORT}/mcp"`; `uvicorn.run(fastapi_app, host="127.0.0.1", port=port, log_level="info")` and its final `return 0`; the Chat Popen's `env=child_env()` and `conf = mcp_config()` followed by `if conf:`; `LAUNCH = str(ROOT / "formvis")`; bands.py `if not (1 <= width <= 65535 and 1 <= height <= 65535) or (not psb and max(width, height) > 30000):` and "Sides must be 1 to 30,000 pixels for a PSD, 65,535 for a PSB."; main.rs `.center()` in the builder chain, `let _ = builder.build();`, `RunEvent::Exit => kill_backend(handle)` and the one-step sidecar spawn chain.

## Claude Code tabs with in-app trust, window-only terminal commands, the sparkle guard · _v1.90.8 (app/services/agents.py, app/services/terminal.py, app/services/claude_code.py, app/routers/terminal.py, app/routers/claude_code.py, app/routers/mcp.py, app/main.py, setup/line_counts.py)

- `agents.py` `INAPP_TOKEN` (secrets.token_urlsafe(24) at import), `INAPP_CLIENT` "Claude Code in formvis", `is_inapp()` with hmac.compare_digest. The Claude tab's MCP configuration carries the header `x-formvis-inapp: ${FORMVIS_INAPP_TOKEN}` and the token lives only in that tab's environment, never in argv (any local user's process list would show it); Claude Code 2.1.303 expands it (checked with a header-logging server). The token is inherited by Claude's own child processes.
- `terminal.py` sessions carry `kind` (shell, claude, agent), `argv` and `env`; restart re-runs a Claude tab's argv; `live_claude()`; `_shell` and `_env` renamed `login_shell` and `base_env`. `claude_code.py` finds the program (FORMVIS_CLAUDE_BIN, PATH, install folders, the login shell's `command -v claude`), builds argv (`--mcp-config`, `--allowedTools mcp__formvis`, `--append-system-prompt`, the prompt last; on resume `--strict-mcp-config --resume [id]`), filters CLAUDE* variables out of the child and locks the check-then-open. Resume runs in the repository folder because the Chat agent runs there and conversations are kept per folder; strict stops the repository's `.mcp.json` from shadowing the in-app server.
- `routers/terminal.py` `POST /claude` with `ClaudeBody`; the URL uses the request's own socket port (right for the desktop's random port; `/api/mcp/registration` and `/api/mcp/status` still say 8190); Claude tabs take input over the WebSocket. `routers/claude_code.py` `GET /api/claude-code/status` (installed, path, version, signedIn, install, folder, terminal).
- `mcp.py`: in-app items are marked `inapp`, served with allowed=0 and run by the window (the Agent Connect switch, deny policy and risky-step approval still apply); a client claiming the in-app name without the token is renamed "(outside)"; `WINDOW_ONLY` (terminal., claudecode., chat., agent.claude, agent.chat) refuses those commands through run_command, run_commands and menu paths for every agent; `_command_ids` factored out of `_risk`.
- `line_counts.py` `SPARKLE_BANNED` in `declined_problems()` (also over frontend/public and index.html, and .svg files): an icon keyed `sparkle`, `icon('sparkle')`, the classic sparkle and three-star wand paths, and star glyphs; the Sparkle brush preset and the sparkle brush type of a filter are names, not icons, and do not match.
- Removed, now elsewhere: `mcp.py` `_risk`'s `ids = [args.get("id")] if name == "run_command" else [...]` and the ui_menu_invoke `__menu_id` block (now `_command_ids`); `terminal.py` `self.kind = "shell"`, `def _shell()`, `def _env()`, and the router's `session.kind == "shell"` tests (now `!= "agent"`).

## Streamed TIFF and PSD writing, user fonts, refused-key times, platform data folder, skill gates, release packaging · _v1.90.7 (app/routers/bands.py, app/routers/system.py, app/services/llm.py, app/services/generative.py, app/services/providers.py, app/core/config.py, app/routers/mcp.py, setup/agents.py, setup/release_notes.py, setup/pyi_hooks/hook-onnxruntime.py, setup/freeze_backend, setup/freeze_backend.bat, src-tauri/src/main.rs, src-tauri/build.rs, src-tauri/capabilities/default.json, src-tauri/tauri.conf.json, src-tauri/wix/app-paths.wxs, .github/workflows/ci.yml, .github/workflows/desktop.yml, packaging/flatpak, packaging/freebsd)

- `bands.py` TIFF route: strips are independent zlib streams, so a thread pool deflates them in parallel; the directory, tags and ICC (34675) are written last so no band needs a rewrite; a classic TIFF over 4 GB is refused (413); the file streams back from disk and is deleted after sending. The PSD and PSB route writes the flat merged picture in parts (four channel spools joined behind the header), raw, because RLE for the merged picture needs a vectorised PackBits and a byte-count table; straight alpha is written (psd-tools mattes the fourth plane to white where alpha is below 255 when it reads). Measured on 6000 by 5120 RGBA in 256-row bands: TIFF peak 84 MB against 405 MB for `imaging._tiff`, pixels equal; PSD 74 MB, planes byte-equal. No window command calls the PSD route yet.
- `system.py` user fonts: `[data]/fonts`, created on first ask; `GET /api/fonts/user` lists family, style and PostScript name from the TTF and WOFF name tables (WOFF2 by file name); `GET /api/fonts/user/{path}` serves one file and refuses traversal, absolute paths, non-font files and null bytes; `/api/fonts/file` looks there first.
- Keys: `llm.py`, `generative.py` and `providers.py` keep the time a key was refused (`refusedAt`), lifted by a new key or a success; language model rows carry `last4`. Fixed: `delete_row` now clears the legacy baseUrl and model when no rows remain, so removing the last row no longer brings it back as the default.
- `config.py` `platform_data_dir()`: new installs use ~/Library/Application Support/formvis, %APPDATA%\formvis or $XDG_DATA_HOME/formvis (a relative XDG value is ignored); an existing ~/Formvis (or the legacy folder) stays in use; FORMVIS_DATA_DIR wins and the portable marker or FORMVIS_PORTABLE=1 puts data beside the engine. setup/agents.py, setup/line_counts.py and e2e/test_local_models.py still default to ~/Formvis and miss a fresh install's platform folder.
- `mcp.py` list_plugins words `plugin:[file]:[command]` (were angle brackets, which the skill gate refuses in the generated tools reference). `setup/agents.py` `skill_problems()` also fails on tag-shaped text in skill markdown and on a colon and space in an unquoted description (both broke the skill upload gates); `tool_map()` writes a Contents list.
- `main.rs` (not built here): `set_display_server` writes `$XDG_CONFIG_HOME/formvis/display-server` and `main()` reads it before the builder (GDK_BACKEND x11 or wayland; X11 also sets WEBKIT_DISABLE_DMABUF_RENDERER=1; a variable already set is never replaced); `system_fonts_english` assumes fontdb re-exports `Language::English_UnitedStates`.
- Packaging (not run): `release_notes.py` takes the CHANGELOG section for the tag; the release carries the .mcpb, SHA256SUMS, a macOS portable zip and zsync files; a lint job; the e2e job installs the engine and waits for its health; macOS universal through PyInstaller universal2 (lipo on two one-file binaries leaves one archive at the end that only one slice finds); Windows i686 and App Paths (`wix/app-paths.wxs`, HKMU); Authenticode on the portable exes when the certificate exists; AppImage zsync update information; a riscv64 tar.gz job allowed to fail; the ONNX Runtime hook keeps the shared and CUDA providers on Linux and Windows and the shared one on macOS; Flatpak aarch64 source; a FreeBSD port skeleton with placeholder sums.
- Replaced, quoted exactly: the release job's inline notes script (a Python regex over CHANGELOG.md); the freeze flags `--collect-binaries onnxruntime --collect-data onnxruntime --copy-metadata onnxruntime` (now the hook); `"minimumSystemVersion": "12.0"`; the scripts job lines `case "$f" in *.bat) continue ;; esac` and `bash -n "$f"` (the loop also ran over Python files and folders; it now checks shell-shebang files only); `mcp.py` `plugin:<file>:<command>`.

## Skin CSS lint, XPM X11 colours, RAW-stage lens correction · _v1.90.6 (app/routers/system.py, app/services/xpm.py, app/services/raw_develop.py)

- `system.py` `_SKIN_CSS_BANNED`, `_skin_css()`; `_read_skin` takes a `"css"` text or a same-name `.css` file and lists a refused one with its reason (url, image-set, @import, @font-face, src:, expression, javascript:, behavior, escapes, `<`, at-rules other than @media, unbalanced braces, over 16 KB).
- `xpm.py` `_colour` reads `rgb:` and `rgbi:`; X11 values for gray, green, maroon, purple and others; `_x11` handles the 1 to 4 shade series (gold3 is 205,173,0). Replaced: `try: r, g, b = ImageColor.getrgb(low)[:3] except ValueError: r, g, b = 0, 0, 0; return r, g, b, 255`.
- `raw_develop.py` `options()` reads distortion, lensVignette, lensMidpoint; `active()` counts the first two; new `lens_correct()` (linear-light vignette gain and radial remap) runs first in `tone()`. Measured on synthetic data: vignette 60 lifts a 0.2 corner to 0.380 with the centre unchanged. Not run on a real RAW file.

## Parallel PNG band deflate, spatial Seamless Tones, plug-ins folder, socket cap and serve auth deadline, picture-aware prompt improve · _v1.90.5 (app/routers/bands.py, app/routers/merge.py, app/routers/plugins.py, app/routers/terminal.py, app/routers/agents.py, app/routers/claude_code.py, app/routers/llm.py, app/services/llm.py, setup/cli.py)

- `bands.py` `new_session`, `_deflate`, `_pieces`, `_finish`, `PIECE`, `_pool` (up to 4 threads): each band's rows are cut into about 1 MB pieces deflated in parallel with Z_SYNC_FLUSH inside one zlib stream (header and running adler32 written around them); the Up filter writes straight into a uint8 buffer. PIL decoded 1x1, 37x90, 3000x700 and 8192x4096 pixel-exact; CPU time unchanged, the wall gain unproven on 2 busy cores.
- `merge.py` `_tone_field` (a smoothed coarse log-ratio grid against the reference, at most 32 cells on the long side, flat gain where the overlap is thin); `blend(..., spatial=True)` returns `fields` and `_multiband` uses them; the route takes `spatial`. Not gradient-domain blending.
- `plugins.py` `_extra`, `GET` and `PUT /api/plugins/extra-folder`; `_folder` and `_inside` take a write flag, the extra folder is read-only and data-folder ids win.
- `terminal.py` `MAX_SOCKETS = 24`, `take_socket`, `release_socket` around the terminal, agents and Claude Code streams (close code 4429 over the cap); `cli.py` `serve --auth-seconds` (30 by default) ends a token session that never authenticates. Measured on a scratch engine: 28 streams gave 24 open and 4 refused.
- `llm.py` `improve` takes a picture for vision rows and returns `{prompt, restored, seen}`, putting back @img tokens the model dropped.
- `cli.py` `WINDOW_OUT` gained tiff-layers, tga and dpx with `WINDOW_EXT`, `process --options JSON`, and a layered .tif output routes through the window.
- Replaced, quoted exactly: `bands.py` `_open[key] = {"f": f, "z": zlib.compressobj(6), "w": width, "h": height, "rows": 0, "path": path, "last": np.zeros(width * 4, np.uint8)}`, `above = np.vstack([s["last"][None, :], rows[:-1]])`, `up = (rows.astype(np.int16) - above).astype(np.uint8)   # PNG's Up filter, modulo 256`, `lines = np.hstack([np.full((n, 1), 2, np.uint8), up])   # filter type 2 before each row`, `packed = s["z"].compress(lines.tobytes())` with `if packed: _chunk(s["f"], b"IDAT", packed)`, and in end `tail = s["z"].flush()`, `if tail: _chunk(s["f"], b"IDAT", tail)`, `_chunk(s["f"], b"IEND", b"")`. `merge.py` `_multiband` `if tones is not None: f = f * np.asarray(tones[k][::-1], np.float32)`. `services/llm.py` improve's `-> str` return of `text[:4000]`. `cli.py` `WINDOW_OUT = {"png", "jpg", "webp", "tiff", "psd", "psb", "ora", "fvd"}`, `name = f"{stem}{flags.get('suffix', '')}.{fmt}"`, the process flag tuple and the convert_cmd branch condition.

## Abandoned agent requests dropped, CLI timeout message, headless logs cleaned, macOS overlay title bar · _v1.90.3 (app/main.py, app/routers/mcp.py, app/routers/commands.py, setup/cli.py, setup/mcp_stdio.py, setup/headless.py, src-tauri/src/main.rs)

- Cause: the `@app.middleware("http")` wrapper kept `request.is_disconnected()` from ever seeing a caller hang up, so `_ask` waited up to 600 s and a killed CLI call's request stayed queued for the next window. `main.py` `IsolateWindow` is now plain ASGI middleware (same CSP for the plugin worker, same COOP and COEP; this supersedes the 1.90.2 note about `call_next`). `mcp.py` `_until_gone(request, task)` cancels the call when the caller leaves and `_ask`'s `finally` drops the queued item; `/mcp` tools/call answers 499 then; `commands.py` `run` uses it. Measured on a scratch engine: before, the next window poll received the stale request; after, the poll returned 204 and a connected caller still finished.
- `cli.py` `call()` reads `FORMVIS_CLI_TIMEOUT` (660 s) and says the request was dropped on a timeout; Ctrl-C exits 130. `mcp_stdio.py` `forward` returns an error tool result on a timeout. `headless.py` `remove_log`, `clean_logs` (dead pid or a day old) at `ensure`, and a run's own log removed when it stops. Measured: png to psd to png, `process --new`, a mixed `serve` batch and the stdio server's 134 tools with `listChanged`, on a real headless Chromium.
- `main.rs`: the main window builder is bound and, on macOS only, gets `.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(tauri::LogicalPosition::new(14.0, 12.0))` before `.build()` (tauri 2.11.6 API). Built, unverified: no desktop build here, `cargo check` not completed.
- Replaced, quoted exactly: `main.py` `@app.middleware("http")`, `async def isolate_window(request, call_next):`, its docstring end `COEP credentialless, which still lets pictures and fonts from other sites load. FORMVIS_ISOLATED=0 turns it off."""`, `response = await call_next(request)`, `if is_plugin_worker(request.url.path):`, `response.headers["Content-Security-Policy"] = PLUGIN_WORKER_CSP`, `if os.environ.get("FORMVIS_ISOLATED", "1") != "0" and not request.url.path.startswith("/api"):`, `response.headers["Cross-Origin-Opener-Policy"] = "same-origin"`, `response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"`, `return response`. `commands.py` `out = await mcp._call("run_command", {"id": cid, "params": body.params if body else {}})`. `cli.py` `with urllib.request.urlopen(req, timeout=660) as r:` and the `except (urllib.error.URLError, OSError):` branch that printed `The formvis engine is not answering at {URL}. Start it with ./formvis boot, then retry.`. `headless.py` release's `if proc is None or proc.poll() is not None:` / `return`. `main.rs` `let _ = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))` through `.disable_drag_drop_handler().build();` (only the binding and the final build changed).

## Plugin worker script served under a closed content policy · _v1.90.2 (app/main.py)

- `main.py` `PLUGIN_WORKER_CSP` (`default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; img-src 'none'; style-src 'none'`) and `is_plugin_worker(path)` (outside `/api`, file name starting `plugin-worker`, ending `.js`); the `isolate_window` middleware adds the header after `response = await call_next(request)`. A policy on a worker's own script governs what it loads, so a folder plugin's static or dynamic import of a URL no longer reaches any server. Measured with a stand-in worker: with the header, `import("http://...")` failed with 0 GETs (1 GET without it); a scratch engine served `assets/plugin-worker-abc.js` with the policy and `assets/index-abc.js` without, both with the isolation headers. Applies to the built app the engine serves; the Vite dev server on 5190 serves the worker without it.
- Replaced: nothing; two regions added.

## Intensity registration for Auto-Align, deep EXR flattened · _v1.90.1 (app/routers/merge.py, app/services/contained.py)

- `merge.py` `_intensity_refine` (ECC homography, translation for Reposition, on 800 px grey copies; rejected below a correlation of 0.3 or with an implausible determinant); `align` and `_align_plain` take `intensity`, `align_route` the form field `registration` (default "features"); a layer with too few features starts from no move and is refined by intensity instead of failing. Applies to Auto, Perspective and Reposition only. Measured on a scratch call: shift (23.4, -11.7) recovered as 23.40, -11.72 by intensity (23.48, -11.62 by features); a flat gradient with three or fewer matches as 9.47, 6.00 for 9.5, 6.0.
- `contained.py` `_flatten_deep`, called from `_binding_decode` for deepscanline and deeptile parts: samples composited front to back by Z, premultiplied over, BGRA float32. Measured: 1 sample (0, .25, .5, .5), 2 samples (0, .375, .75, .75), empty pixel clear. A Python loop per pixel: large deep frames are slow under the 60 s child limit.
- Replaced, quoted exactly: `def align(images: list[bytes], projection: str, vignette: bool, reference: int = 0, distortion: bool = False) -> dict:`, `res = _align_plain(data, projection, vignette)`, `def _align_plain(images: list[bytes], projection: str, vignette: bool) -> dict:` with its docstring line `RANSAC homography; Reposition keeps only a translation. With vignette, the`, `raise ValueError(f"Layer {n + 1} has too few features to align.")`, `good = [m[0] for m in bf.knnMatch(ds, rd, k=2) if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]`, `if len(good) < 3:`, `out.append(mat if mat is not None else _translation(src, dst))`, `async def align_route(file: list[UploadFile] = File(...), projection: str = Form("auto"), vignette: bool = Form(False), reference: int = Form(0), distortion: bool = Form(False)) -> dict:` and `return await run_in_threadpool(align, data, projection, vignette, reference, distortion)`.

## DNG gain maps, white balance in Kelvin, the camera look from the embedded preview, contained file parts, cut-off JPEGs · _v1.90.0 (app/services/raw_develop.py, app/services/imaging.py, app/services/contained.py, tests/test_raw.py)

- `raw_develop.py`: `gain_maps` (opcode list 51009 read through `_ifd_at` and `_read_opcodes`), `gain_field` (lens shading applied to the linear image), `kelvin_multipliers` and `as_shot_kelvin` (temperature from the camera matrix), `look_curves` and `apply_look` (per-channel curves fitted to the embedded preview, kept monotonic); `develop` applies them when asked. `imaging.py` `_wb_kwargs(..., kelvin=)` and `_truncated_jpeg`; `options()` takes `kelvin` and `look`. `contained.py` `_view_of` for part labels and placement.
- Three tests the raw agent added to `tests/test_raw.py` (gain map, Kelvin, camera look) were removed by the lead: no self-written tests. The file is as it was at 1.89.9.
- Replaced, quoted exactly: `def _wb_kwargs(raw, wb: str, temperature: float, tint: float) -> dict:` and its docstring end `down, up to 0.5 stop at 100)."""`; `custom = wb != "as_shot" or bool(temperature) or bool(tint) or raw_develop.active(develop)`; both `raw_develop.develop(raw, _wb_kwargs(raw, wb, temperature, tint), develop, half, 8, rawpy)` and `raw_develop.develop(raw, _wb_kwargs(raw, wb, temperature, tint), develop or {}, half, 16, rawpy, space)`; `out = {"exposure": num("exposure", -5, 5), "noise": num("noise", 0, 100)}`; `def develop(raw, wb: dict, o: dict, half: bool, bits: int, rawpy, space: str = "srgb") -> np.ndarray:` with its docstring, `if not active(o):`, `return raw.postprocess(**wb, output_color=colour, output_bps=bits, half_size=half, **({"gamma": (1.8, 0)} if wide else {}))`, `lin = raw.postprocess(**wb, **libraw_kwargs(o, raw, rawpy), output_color=colour, output_bps=16, gamma=(1, 1), half_size=half)` and `return encode(tone(lin.astype(np.float32) / np.float32(65535.0), o), bits, space)`. `contained.py` `groups.append({"key": key, "label": _group_label(p, key), "channels": int(shape[2]) if len(shape) == 3 else 1})`, `q.put({"width": x1 - x0 + 1, "height": y1 - y0 + 1, "parts": listing,` and `meta.append({"name": _group_label(parts[i], str(pick.get("key"))),"width": px.shape[1], "height": px.shape[0], "x": boxes[i][0] - x0, "y": boxes[i][1] - y0})`.

## Language model rows and refused keys, data folders for templates and recipes, settings location, agent session idle, MCP export and open widened, masked Photomerge, ComfyUI graph, assistant tool policies, 16-bit depth, headless CLI · _v1.89.9 (app/services/llm.py, app/routers/llm.py, app/services/providers.py, app/services/generative.py, app/routers/comfyui.py, app/core/config.py, app/routers/system.py, app/services/agents.py, app/routers/agents.py, app/routers/mcp.py, app/services/stitch.py, app/routers/merge.py, app/localgen/depth.py, setup/cli.py, setup/headless.py, setup/mcp_stdio.py, formvis, src-tauri/src/main.rs, docs/MANUAL.md)

- `llm.py`: `_rows`, `_active`, `save_row`, `use_row`, `delete_row`, `_row_key`; routes `POST /rows`, `PUT /rows/{id}`, `POST /rows/{id}/use`, `DELETE /rows/{id}`; a model without the vision flag gets no pictures; keys never in responses or logs (measured 0 matches); `GET /api/llm/templates` reads the prompt-templates data folder. `providers.py`, `generative.py`: `_refused`, `_print` flag a key a service refuses (401, 403) until a new one is saved. `comfyui.py`: `GET, PUT, DELETE /api/comfyui/recipe-files` (path traversal refused) and `GET /api/comfyui/graph` through `_request`, so the same-host redirect guard stays.
- `config.py` `data_dir_source()`; `agents.py` `SESSION_IDLE` (1,800 s), `_idle_at`, `tool_policies(client)` and `GET /api/agents/tool-policies`. `mcp.py`: `open_file` `into`, `svg_width`, `reference`; `place_image` `reference` and SVG; `transform_layer` `distort` and `warp`; `export_image` TIFF, TGA, DPX, BMP, EXR, HDR with `layers`, `dpi`, `metadata`, `exr_compression`, `half`, `options` and write-back (`_EXPORTS`, `_ENCODED`, `_opened`, `_write_back`); `new_document` CMYK with a profile; `ui_window` quit with confirm.
- `stitch.py` `_canvas`, `_weight`, `compose_layers`; `merge.py` `panorama_layers` and the `layers` field. `depth.py` `encode16` and `fmt=png16` (1,024 levels from a 1,024-step ramp).
- CLI: `setup/headless.py` (`ensure`, `release`, `host`, `status`, `window_url`) and `./formvis headless`; `cli.py` `open_source`, `convert_window`, `COMMAND_METHODS`, `LAYERED`, `WINDOW_OUT`, `--atn`, `--new`, `--verbose`, `--headless`, serve `--token` and `doc.*` methods, mixed batches; `mcp_stdio.py` `tools.listChanged` with `watch_tools`, `--root`, `--read-root`, `--headless`. The layered convert path was not run end to end.
- `main.rs`: the shell's own start-up update check (`check_for_updates`, its dialog and restart) is removed; the page now checks at start and installs through the existing `install_update` command, still gated by the empty updater key (built, unverified: no desktop build here).
- Replaced, quoted exactly: `cli.py` `command_result("open-image-data", ...)` in `process_one`, the `if flags.get("action")` block, `fmt not in ("png","jpg","webp","tiff")`, and `command_result("export-to-file", params, yes)`. `main.rs` `use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};`, the whole `fn check_for_updates(handle: tauri::AppHandle)` (the `updater_configured` guard, `updater.check()`, the "Update available" OkCancel dialog, `download_and_install`, the `RestartAfterExit` store and `ask_page_to_quit`) and its call `check_for_updates(handle.clone());`. `stitch.py` compose's corner and canvas block (now `_canvas`).

## The engine no longer deletes /dev/null; multiband blend, spherical and collage alignment, HDR ghost removal · _v1.89.8 (app/__init__.py, app/services/lcms.py, app/routers/merge.py, app/services/stitch.py)

- Found by the lead after the 1.89.7 container lost `/dev/null`: on Linux, `ctypes.util.find_library` falls back to `ld -t -o /dev/null -l<name>` when its compiler probe finds nothing, and a failed link removes its output file. Run as root, `lcms.py` (probing `liblcms2.so.2`, `liblcms2.2.dylib`, `lcms2.dll`) and the keyring package's macOS backend (probing Security, Foundation and CoreServices at import) deleted the null device; traced with `strace -f -e unlink` against a stand-in file. Fixes: `lcms.py` passes library names straight to the loader (Linux sonames, the two usual macOS paths, the Windows names); `app/__init__.py` switches the `_findLib_ld` fallback off for the engine process on Linux before any dependency loads. Rechecked: no backend test file removes the stand-in any more; full suite 113 of 115 (the two real-model tests).
- `merge.py`: `_multiband` and the `multiband` branch in `blend()` (a Laplacian pyramid along the panorama seams, not gradient-domain); `align` takes `spherical` and `collage`; `_ghost_weight` and the `ghost` and `base` fields of `hdr` and `hdr_route` (synthetic bracket error 0.0450 to 0.0070). `stitch.py`: `sphere()`, and `register` bends with either projection.
- Replaced, quoted exactly: `lcms.py` `for name in ("lcms2", "liblcms2.so.2", "liblcms2.2.dylib", "lcms2.dll"):` with `path = ctypes.util.find_library(name) or name`, `found.append(path)` and the `except Exception: found.append(name)` fallback. `merge.py` `if projection != "cylindrical" and not distortion:`, `stitch.register(imgs, "cylindrical" if projection == "cylindrical" else ("reposition" if projection == "reposition" else "perspective"), 0)` and `changed = projection == "cylindrical" or ...`. `stitch.py` `if projection == "cylindrical":` and `out = [cylinder(im, f_used, fr[:2]) for ...]`.

## FITS extensions, DPX orientation, SubIFD pages, an XPM reader, graphics memory, the portable marker, packaging · _v1.89.7 (app/services/fits.py, app/services/dpx.py, app/services/imaging.py, app/services/xpm.py, app/services/metrics.py, app/core/config.py, setup/libcheck, setup/freeze_backend, setup/freeze_backend.bat, build_app, formvis, src-tauri, .github/workflows/desktop.yml, packaging/msix)

- `fits.py`: the first IMAGE extension when the primary holds no picture (`_data_size`, `_image_extension`), BITPIX 64, BLANK as missing, ROWORDER; `_header(data, pos=0)`. `dpx.py`: the orientation word at offset 768. `imaging.py`: SubIFD pages in `pages` and `decode_to_png` (`_subifd_pages`, `_subifd_image`); .xpm and .pm through the new `xpm.py` (XPM3 and XPM2, hex and CSS colour names).
- `metrics.py`: `graphics_memory()` (nvidia-smi, else the Windows counters, cached 2 s) as `gpu` in `/api/metrics`. `config.py`: a file named `portable` beside the frozen engine also turns portable mode on.
- Packaging (all built, unverified; no keys, tokens or updater key added; the updater stays gated): `desktop.yml` manual draft releases, more architectures, Windows signing only when its secrets exist, a tar.gz per architecture; `packaging/msix/AppxManifest.xml`; deb recommends and `setup/libcheck` (`./formvis libcheck [--dialogs]`); ONNX Runtime collected in both freeze scripts; `main.rs` keeps the web view data beside a portable Windows install.
- Replaced, quoted exactly: `fits.py` `if naxis < 2: raise FitsError("This FITS file holds no picture (NAXIS is under 2).")`. `config.py` the docstring `...a file named portable.txt sits beside the frozen engine...` and `(getattr(sys, "frozen", False) and (beside / "portable.txt").is_file())`. `metrics.py` `got.update({"pid": os.getpid(), "total": config.total_memory(), "uptime": int(time.time() - runtime.STARTED)})` (now with `gpu`). `build_app` `if [ "$open_app" = 1 ]; then "$CARGO_TARGET_DIR/release/formvis" >/dev/null 2>&1 & fi`. `freeze_backend` `extra+=(--collect-all rembg --collect-all onnxruntime --hidden-import rembg)`. `desktop.yml` the build step's if or else on `TAURI_SIGNING_PRIVATE_KEY`, the three-entry matrix, the zip names `formvis-portable-windows-x64.zip` and `formvis-linux-x64.tar.gz`, `os.environ['GITHUB_REF_NAME']` twice in `latest.json` with its three-platform `targets`, and the release job condition `startsWith(github.ref, 'refs/tags/v')`.

## Plugin folder routes, pack and UI control MCP tools, agent file roots and budgets, offline CLI, droplet data, 16-bit ProPhoto raw · _v1.89.5 (app/routers/plugins.py, app/routers/mcp.py, app/routers/mcp_pack.py, app/services/agents.py, app/routers/agents.py, app/services/raw_develop.py, app/services/imaging.py, app/routers/io.py, setup/cli.py, setup/cli_offline.py, setup/agents.py)

- `plugins.py`: `GET /api/plugins/folders`, `GET` and `PUT /folders/{id}/{path}`, `DELETE /folders/{id}` (path traversal and bad names give 422 or 404).
- `mcp.py`: 29 tools (134 in all), strict schemas, `_budgeted` output caps (text 200,000 characters, images 12 MB, settable), `file_roots` and `agents.limits()["roots"]` confining agent reads and writes, 8 calls in flight per client, Render Video progress and cancel; `mcp_pack.py` the ailabel, film and glb tools; `_EXPORTS` adds .psd, .psb, .ora. `agents.py` keeps `limits`; `GET/POST /api/agents/limits`.
- `raw_develop.py`: `SPACES` and a `space` argument (ProPhoto RGB through LibRaw, gamma 1.8); `/decode` takes `space` and returns `X-Profile`.
- `setup/cli.py`: `droplet_data`, `droplet_run`, `droplet_cmd` (`--data`, `--to`, `--quality`, `--suffix`, `--recursive`), `attach_files`, `OFFLINE_METHODS`; `setup/cli_offline.py` stack (mean, median, maximum, range, standard deviation equal to numpy), contact, fit, photomerge, hdr without the window.
- Replaced, quoted exactly: `mcp.py` `roots = [r for r in os.environ.get("FORMVIS_AGENT_ROOTS", "").split(os.pathsep) if r.strip()]   # when set, the only folders agents may read or write` (now also `or agents.limits()["roots"]`); `result = await task`; `_EXPORTS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}`; `texture: frosted|blocks|canvas|tinyLens,`; `if name not in _FILES or (name == "place_image" and not args.get("path")):`. `agents.py` `_save` wrote `{"policies": _policies}`. `raw_develop.py` `def encode(x: np.ndarray, bits: int) -> np.ndarray:` (sRGB only) and `def develop(raw, wb: dict, o: dict, half: bool, bits: int, rawpy) -> np.ndarray:` with `output_color=rawpy.ColorSpace.sRGB` in both postprocess calls. `imaging.py` `raw_deep(..., develop: dict | None = None)` calling `..., half, 16, rawpy)`. `io.py` `develop: str = Form("")) -> Response:` without `X-Profile`. `cli.py` `words, flags, _ = split_flags(args, ("--format", "--out", "--name"))` and the script-writing body.

## Merge to HDR Pro align and exposure times, optimized JPEG · _v1.89.4 (app/routers/merge.py, app/services/imaging.py)

- `merge.py`: `hdr(images, align, times)` aligns only when asked and uses entered exposure times (a count mismatch raises); `hdr_route` takes `align` and `times` form fields. Replaced: `def hdr(images: list[bytes]) -> tuple[bytes, dict]:`, the unconditional `cv2.createAlignMTB().process(imgs, imgs)`, and `hdr_route(file: list[UploadFile] = File(...))`.
- `imaging.py`: JPEG save takes `optimize`. Replaced: `progressive=bool((options or {}).get("progressive")), dpi=(dpi, dpi), **extra)`, which now has `optimize=bool((options or {}).get("optimize")),` before `dpi=` (81,579 bytes plain, 77,428 optimized on the test image).

## DirectML choice, model folder scan, a download token, local files, user skins, seed for fal fill, ComfyUI probe and progress, quick sky · _v1.89.3 (app/services/compute.py, app/localgen/paths.py, app/localgen/model_manager.py, app/routers/system.py, app/services/generative.py, app/routers/generative.py, app/services/providers.py, app/routers/comfyui.py, app/localgen/inpaint.py, app/routers/sky.py)

- `compute.py`: `dml` (DirectML) in `DEVICES`, `PROVIDER` and `LABEL`; Automatic tries cuda, metal, dml, cpu; `paths.providers()` and `model_manager.providers()` return `compute.current()["providers"]` so every helper model follows the choice; `set_preference` releases sessions. `POST /api/models/scan` links files whose SHA-256 matches a pinned model; `GET/PUT /api/models/token` keeps a Hugging Face token in the keyring (last four shown) and sends it only to huggingface.co. `GET /api/localfiles/stats` and `POST /api/localfiles/clean`. `GET /api/skins` lists linted user theme files. API key status shows the last four characters. The fal fill route takes a seed.
- `comfyui.py`: `POST /api/comfyui/probe` (version, Python, PyTorch, devices, queue, node packs, and per kept recipe the missing nodes and unlisted models); `_watch` and `_follow` read the user's ComfyUI websocket for progress with a per-run client id (`/job` returns `progress`); the 1.88.7 same-host redirect guard is kept. `inpaint_warm` warms LaMa. `sky.py` `quick_sky` and `?quick=true`: a no-model sky method for when the model is not downloaded (IoU 0.89 clear, 0.97 overcast on synthetic scenes).
- Removed by the lead: a test the settings agent added to `tests/test_compute.py` (`test_directml_is_a_choice_and_the_last_automatic_gpu`), against the owner's no self-written tests rule.
- Replaced, quoted exactly: `paths.py` `providers()` was `import onnxruntime as ort\n    available = ort.get_available_providers()\n    return [name for name in PROVIDERS if name in available] or ["CPUExecutionProvider"]` (and the same logic in `model_manager.providers()`); `providers.py` `status()`'s one-line list comprehension became a loop adding `last4`; `comfyui.py`'s `client_id: "formvis"` and the `if job in running:` branch became `step = _PROGRESS.get(...)`.

## Photomerge layouts, cylindrical Auto-Align, lens correction in alignment, Auto-Blend halo control · _v1.89.2 (app/services/stitch.py, app/routers/merge.py)

- `stitch.py`: Perspective, Cylindrical and Collage layouts, a focal length from the pairwise homographies (701.6 against 700 true on synthetic views), cylindrical warping, a radial k1 estimate (0.0997 against 0.10) and vignette removal. `merge.py`: `_finish` (the crop and encode, moved out of `panorama`), `align` with Cylindrical, a reference layer and distortion correction (cylindrical 0.75 px mean error against ground truth), `_align_plain` (the old `align`), `_guided` for Halo Control in `blend`, and seamless tones by a mid-tone median ratio.
- Replaced, quoted exactly: the `panorama` crop block from `if crop:` / `small = cover[:: max(1, cover.shape[0] // 512), :: max(1, cover.shape[1] // 512)]` through `Image.fromarray(np.ascontiguousarray(rgba), "RGBA").save(out, "PNG")` and `return out.getvalue(), len(kept)` (now `_finish`); in `blend`, `wts` stays for non-halo runs and the tones `g = layers[0][0][both].mean(axis=0) / np.maximum(bgr[both].mean(axis=0), 1.0)` became a median ratio; the docstring line "Cylindrical is treated as Perspective." was removed.

## Readers, jobs, limits and agents: PFM and PAM CMYK, TGA split alpha, 10-bit HEIF, EXR layout and selection with Cryptomatte, link path safety, ComfyUI UI-format conversion, scratch folder, decompression limits, cross-origin isolation, 26 MCP tools, resources, transport limits, CLI info, convert, jobs and serve · _v1.89.1 (app/services/pnm.py, app/services/imaging.py, app/services/contained.py, app/routers/io.py, app/routers/system.py, app/services/comfy_convert.py, app/routers/comfyui.py, app/routers/undo.py, app/main.py, app/routers/mcp.py, app/services/agents.py, setup/cli.py, setup/mcp_stdio.py, setup/mcpb.py, setup/mcpb/manifest.json, setup/perf.py, setup/corpus.py, formvis, .claude-plugin/plugin.json)

- Readers: PFM and PAM CMYK (`read_pfm`, `_read_pam`), `POST /io/decode-split` (opaque colour and an alpha PNG for TGA), `heif_deep` (10-bit HEIF opens at 16 bits), `inspect_exr` with `POST /io/exr-layout` and `/io/exr-select` (parts, channel groups and Cryptomatte mattes per manifest object), `_plausible` refuses a header that declares an implausible size before decoding. `GET /api/file` resolves linked paths safely (`_link_target`: UNC refused, relative paths need a base and cannot leave it, the suffix is checked after symlinks, 1 GB cap). `comfy_convert.py` and `POST /api/comfyui/convert` turn a local ComfyUI editor-format workflow into API format using that ComfyUI's `/object_info` (the 1.88.7 same-host redirect guard is kept). `GET/PUT /api/undo/scratch` moves the history scratch folder. A middleware sets COOP same-origin and COEP credentialless on the window's pages (`FORMVIS_ISOLATED=0` turns it off).
- MCP 79 to 105: H1 added list_recipes, select_color, select_shape, select_range, set_active_layer, align_layers, group_layers, set_group, set_mask, add_filter, set_filter, set_text, list_history, take_snapshot, restore_snapshot, delete_snapshot, extend_canvas, export_layer, read_log, list_brush_tips, set_brush, sample_mean_color; set_layer takes locks, resize_image percent and long_side, export_image scale. H2 added file_info, convert_file, jobs_list, jobs_cancel (engine side, no window), five resources (document, layers, selection, commands, jobs), a 64 MB body limit (413), 32 calls in flight, a 24 MB reply budget and optional `FORMVIS_AGENT_ROOTS`; list_commands returns `enabled` and `keys`. CLI: info, convert, jobs, serve (JSON lines with `--root`), version and per-command help; `mcp_stdio.py --attach`; an .mcpb manifest and builder; a Claude Code plugin manifest. `./formvis perf` and `./formvis corpus` scripts.
- Replaced, quoted exactly:
  - `pnm.py`: the `wanted` tuple lines and `if depth not in (1, 2, 3, 4):` in `_read_pam`.
  - `mcp.py`: `if name in agents.RISKY_TOOLS:` and `at {args.get('path', 'a path')}, which Undo cannot restore"` in `_risk`; `"capabilities": {"tools": {}, "prompts": {}}` in both places; `try:\n        msg = json.loads(await request.body())\n    except ValueError:`; in tools/call `out = _ok(req_id, await task, modern)` became a size-checked `result`; list_commands' props `{"group": ..., "text": {"type": "string", "maxLength": 120}}`; set_layer's description "Changes a layer's name, visibility, opacity (0 to 1) or blend mode, or makes it the active layer." and its schema end `"active": {"type": "boolean"}}, ["id"], idempotent=True),`; resize_image's "Resamples the whole document to width x height pixels (keep the shape by scaling both by one factor)." with `}, ["width", "height"]),`.
  - `tests/test_mcp.py`: `d["capabilities"] == {"tools": {}, "prompts": {}}` (resources added).
  - `agents.py`: `"timeline_render": "overwrites a video file"}` gained convert_file; `setup/agents.py`: `("History", {"undo", "redo"})]` gained the new groups.
  - `cli.py` `split_flags`: `if a == "--yes":\n            flags["yes"] = True\n        elif a == "--run":`; the `call` headers gained `X-Formvis-Client`.

## Writers: PNG interlace, EXR compressions and channels, PFM, TIFF compression and BigTIFF, WebP lossless, JPEG grey and progressive, PDF grey and CMYK, fsync atomic saves; colour: built-in profiles, proof presets, gamut threshold, Profile Info · _v1.89.0 (app/services/png_write.py, app/services/contained.py, app/services/imaging.py, app/routers/io.py, app/services/projects.py, app/services/lcms.py, app/services/colour.py, app/routers/colour.py)

- `png_write.py`: Adam7 interlace with pHYs and iCCP (PIL reads the interlace flag 1 and equal pixels; cv2 and PIL decode 7 edge sizes with 0 mismatches). `contained.EXR_COMPRESSIONS` and `_binding_encode(img, opts)`: compression, half float, channels rgba, rgb, ya or y (all 8 compressions read back as themselves; lossless six exact); a PFM writer. TIFF: none, PackBits, LZW, Deflate and BigTIFF (none or Deflate; `imagecodecs` is absent so other BigTIFF compressions are refused), grey TIFF. WebP lossless (round trip equal), JPEG grey and progressive, PDF white or black background and grey or CMYK pages. `_write_atomic` fsyncs the file and the folder, and `/api/io/export` uses it (a failed save kept the old file and left no .tmp). Project zips carry QuickLook thumbnails. tests test_deep_io, test_api, test_comp_import 24 passed.
- `lcms.py`: ProPhoto, sRGB Linear, ACEScg, Rec. 2020 and Macintosh RGB (Gamma 1.8) built with `cmsCreateRGBProfile`, sGray and Dot Gain 20%, listed by `colour.profiles()` (ACEScg of linear sRGB red 0.6131 0.0702 0.0206). The gamut warning takes a delta E threshold (`gamutDelta`, 99 refused with 422). `profile_info` adds class, PCS, version, size and copyright. tests/test_colour.py 4 passed.
- Replaced, quoted exactly:
  - `contained.py`: `def _binding_encode(img: np.ndarray) -> "bytes | None":`; `header = {"compression": OpenEXR.ZIP_COMPRESSION, "type": OpenEXR.scanlineimage}` became `header = {"compression": getattr(OpenEXR, kind), ...}`; `with OpenEXR.File(header, {name: px}) as f:` became `with OpenEXR.File(header, packed) as f:`; `def _encode_worker(img: np.ndarray, q` became `(arg: tuple, q`; `def encode_exr(img: np.ndarray) -> bytes | None:` and `out = _run(_encode_worker, img)` became `encode_exr(img, opts=None)` and `_run(_encode_worker, (img, opts or {}))`.
  - `io.py`: `    target.write_bytes(file.file.read())` became `_write_atomic(target, file.file.read())`; the encode-deep formats gained `"pfm"`.
  - `imaging.py`: `elif fmt == "tiff": rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi), **extra)` became `return _tiff(...)`; the PDF branch's `flat = Image.new("RGB", rgba.size, (255, 255, 255))` takes the background and mode.
  - `projects.py` `_write_atomic`: the old body had no flush or fsync.
  - `lcms.py` grey branch: `if gamma is None: params = (c_double * 5)(2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045); curve = lib.cmsBuildParametricToneCurve(None, 4, params) else: curve = lib.cmsBuildGamma(None, gamma)`.

## Raw: identification by content, metadata, raw-stage tone and noise in the develop, list_fonts · _v1.88.9 (app/services/raw_develop.py, app/services/imaging.py, app/routers/io.py, app/routers/mcp.py)

- `raw_develop.sniff` identifies raw files by content (RAF, ORF, RW2, MRW, X3F, CRW, CR3 and CR2 magics, the DNGVersion tag, maker TIFFs with SubIFDs), so a DNG named .tif decodes the same (diff 0); `info` gives make, model, sensor size, CFA pattern, white balance multipliers, orientation and baseline exposure (`POST /io/raw-info`; a non-raw gets 415). `imaging.is_raw` and `raw_info`; `decode_to_png` and `/io/decode` use `is_raw`.
- `develop`, `tone`, `encode` in linear light: Exposure, Highlight Recovery (LibRaw clip, unclip, blend, rebuild), Noise Reduction (FBDD and a guided-filter `denoise`; this LibRaw build ignores the wavelet threshold), adaptive Black Point, Shadows, Highlights, Clarity, Texture and Dehaze, through a `develop` JSON field on `/io/decode` at 8 and 16 bits. At zero the curve equals LibRaw's default within 1; a noisy DNG's flat-region spread went 2.2 to 0.54. tests/test_raw.py 4 of 4.
- `list_fonts` (MCP, 79 tools): families, or one family's four faces with whether the file is readable and how many characters it maps.
- Nothing removed or replaced.

## Twelve MCP tools: boxes, sample_box, frequency_separation, sample_depth, depth_edit, set_crop, export_mask · _v1.88.8 (app/routers/mcp.py)

- 66 to 78 tools: `boxes_list`, `boxes_add`, `boxes_set`, `boxes_remove`, `boxes_from_selection`, `boxes_clear` (at most 24 boxes), `sample_box` (mean colour in a box), `frequency_separation` (radius 1 to 250), `sample_depth` and `depth_edit` (flatten, nearer, farther, smooth, snap, inside a selection when there is one), `set_crop` (box, angle, output size and resolution), `export_mask` (a layer mask or the selection as a PNG; `_FILES["export_mask"] = ({".png"}, False)`; refuses folders outside the allowed ones, relative paths, other types and an existing file unless overwrite). Each has a `USE_WHEN` line. Nothing removed. tests/test_mcp.py 9 of 9.
- Not built: depth_from_layer (the command returns before the model finishes), apply_preset (presets live in panel constants), select_by_text, realism_pass, match_edges, ComfyUI graph tools (declined), set_status.

## ComfyUI sign-in, a saved models folder, chats kept and cleared · _v1.88.7 (app/services/comfyui_auth.py, app/routers/comfyui.py, app/services/llm.py, app/routers/llm.py, app/localgen/paths.py, app/localgen/model_manager.py, app/services/segment.py)

- `comfyui_auth.py`: none, basic, bearer or a custom header for the user's own ComfyUI server; the secret goes to the keyring (a 0600 file when there is none) and is never returned; bad header names, `Host` and unknown modes are refused with 422. `/api/comfyui/auth` reads and saves it; `_request` adds the headers to every ComfyUI call. With a sign-in, `_SameHostRedirects` follows a redirect only to the same scheme, host and port: urllib copies the request's headers onto a redirect, so a ComfyUI that redirected elsewhere would have handed the credentials to that server (the agent flagged it; fixed before release). Checked with two stand-in servers: a same-host redirect kept `Bearer tok123`, a cross-host one was refused and the other server saw no header; without a sign-in redirects follow as before.
- `llm.py`: chats kept is a setting (`keep`, at most `CHAT_LIMIT_MAX`) and `DELETE /api/llm/chats` clears them (keep 3 after 5 saves left 3). `paths.saved_folder` and `GET/PUT /api/models/folder`: a models folder chosen in Preferences, read at the next start; `FORMVIS_MODELS_DIR` still wins; a relative path is refused.
- Replaced, quoted exactly: `for old in chats()[CHAT_LIMIT:]:` became `for old in chats()[keep:]:`; the eight `outbound.request(` calls in `routers/comfyui.py` became `_request(`.

## Six MCP tools and wider get_image and new_document; seed for fal generation; free helper models · _v1.88.6 (app/routers/mcp.py, app/services/generative.py, app/routers/generative.py, app/routers/system.py)

- New tools (60 to 66): `ping` (version, window live, allowed, documents; never opens a window or asks consent), `close_document` (by id or active), `list_plugins`, `select_feather`, `select_grow` (positive grows, negative contracts), `select_point` (inside and outside points). `get_image` gains `view` (document, editor, layer), `id`, a 1:1 box, `format` and `quality`; `new_document` gains `aspect` and `size_class` (1k, 2k, 4k; sides in steps of 16) and no longer requires width and height (16:9 at 1k gave 1024x576, 21:9 at 2k 2048x880). `GET /api/mcp/registration` gives the Claude Code lines and the Claude Desktop JSON for Agent Connect's copy buttons. tests/test_mcp.py 9 of 9.
- `generative.generate` and the `/generative/generate` route take `seed` (sent to fal when set and not -1). `GET /api/helpers` and `POST /api/helpers/free` list and release formvis's own ONNX sessions.
- Replaced, quoted exactly:
  - `_tool("get_image", "The document as it looks, as a PNG image, its longer side at most max_size pixels.", {"max_size": {"type": "integer", "minimum": 64, "maximum": 2048, "default": 1024}}, read=True, idempotent=True),` and `_tool("new_document", "Opens a new document.", {"width": {...}, "height": {...}, "name": {...}, "background": {...}}, ["width", "height"]),`.
  - `def generate(prompt: str, width: int, height: int) -> bytes:` with the docstring `"""A picture from `prompt` alone with FLUX1.1 [pro], as PNG, at generation_size(width, height)."""`; `async def generate(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024), provider: str = Form("fal")) -> Response:` and `png = await run_in_threadpool(generative.generate, prompt, width, height)`.

## Engine log file, one engine per data folder, switches, process metrics, PCX, XPM and preset kinds on disk · _v1.88.5 (app/core/runtime.py, app/core/config.py, app/main.py, app/routers/system.py, app/routers/io.py, app/services/metrics.py, formvis_engine.py)

- `core/runtime.py`: `start_logging` writes `Logs/formvis-engine.log` through a `RotatingFileHandler` (1 MB, 3 backups; `FORMVIS_LOG_BYTES`, `FORMVIS_LOG_LEVEL`) and carries the uvicorn loggers; `GET /api/log` returns the tail (command `copy-engine-log`). At a 2048-byte limit 120 requests gave the log and .1 to .3, each at most 2046 bytes.
- `claim` and `release`: `engine.lock` in the data folder; a second engine on the same folder exits 2 with a message, a lock left by a dead or zombie process is replaced. Only the desktop entry (`formvis_engine.py main`) claims it: a claim in the app's lifespan stopped any second server in the same folder, the MCP stdio test's own server included, so it was taken out of `app/main.py` (the lifespan still calls `release`, which only removes a lock this process holds).
- `apply_switches`: `--user-data-dir`, `--portable`, `--port`, `--no-comfy` (the ComfyUI routes are left out; the window disables their commands), `--tiles` and `--no-tiles` (reported, not yet honoured by the page). `config.portable_dir()`; `data_dir()` takes the switch or `FORMVIS_DATA_DIR`, then a portable folder, then `~/Formvis`.
- `services/metrics.py` and `GET /api/metrics`: working set, peak, private bytes, threads, the computer's free and total memory (Linux measured: 566 MB working set, 4850 of 8030 MB free; the Windows and macOS branches are untested).
- `routers/io.py` `DISK_KINDS` gained `.pcx`, `.xpm` and the preset kinds.
- Removed from `app/main.py` lifespan, quoted exactly: `    runtime.claim(data)`.

## Language-model chat: tool exclusions, saved chats, token usage, a picture budget · _v1.88.3 (app/services/llm.py, app/routers/llm.py)

- `/chat` drops the tools named in `body.exclude`; `chat()` keeps at most the newest 4 pictures a request (`_budget_pictures`, an oversize one dropped) and returns the service's prompt, completion and total tokens and a `pictures` count. Saved chats live in the data folder under `chats/` with owner-only permissions, local callers only (`require_local`): a bad id is 404, a chat over 2 MB is 413, at most 100 are kept.
- Replaced: the old body of `chat()` sent `"messages": messages` with no usage and no picture count; it now sends `_budget_pictures(messages)` and returns usage. Added `import re`, `import time` and `from app.routers.terminal import require_local`.

## Four agent tools: select_mask, list_settings, set_settings, ui_inspect · _v1.87.8 (app/routers/mcp.py)

CLOSE_GAPS P21. Only additions; the catalogue goes from 56 to 60 tools, none in CORE, each with its USE_WHEN line.

- `select_mask` (transparency, layer mask or vector mask as the selection, invert, mode, optional layer); `list_settings` (the scalar preferences); `set_settings` (validates the name and type, asks the person first, then saves and applies through the window's preferences so values stay in range); `ui_inspect` (a CSS selector and a limit: tag, id, text, label, visible, disabled, pressed and box for each match).
- Measured through the window: select_mask on a 200 x 120 document answered "Selected from Background's transparency: 200 by 120 at 0, 0", the mask source on a layer with none "Background has no layer mask."; set_settings took History States from 100 to 50 and refused a string and an unknown name; ui_inspect on "button" found 3,003 and returned 3. Not done: a ui_screenshot tool.

## The Relight runtime installs from the app; MoGe-2 runs through it · _v1.87.7 (app/localgen/relight_runtime.py, app/localgen/relight_scene.py, app/localgen/relight_split.py)

CLOSE_GAPS D39, the owner's audit: the model file already downloaded from Local models (checked: a real 141 MB download reached ready), but nothing installed the Python packages MoGe-2 needs, and a frozen engine cannot take them.

- `relight_runtime.py` (new): a virtual environment of its own at models/relight-runtime, as Krea 2 has (`install(report, cancelled)` from requirements_relight.txt or the pinned `PINNED` list plus numpy, pip output streamed for progress and cancel, then an import check of torch and moge; refused without git, which the moge package needs; ready at once when the engine's own Python already has the packages), `start()` (one job at a time), `status()`, `installed()`, `engine_has_moge()`, `infer()` (runs MoGe-2 in the runtime's Python and returns the arrays as npz). `relight_split.py`: `GET /api/relight/runtime` and `POST /api/relight/runtime/install` (202) after `_moge_ready`.
- `relight_scene.py`: `moge_ready()` is `engine_has_moge() or installed()`; replaced:

```python
    try:
        import importlib.util
        return importlib.util.find_spec("moge") is not None and importlib.util.find_spec("torch") is not None
    except Exception:
        return False
```

  `_moge_raw(small)` runs in this process when it can, otherwise through the runtime; `_moge_scene` uses it. Moved out of `_moge_scene` into `_moge_raw`: `global _moge`, `import torch`, `from moge.model.v2 import MoGeModel`, `if _moge is None:` with `_moge = MoGeModel.from_pretrained(str(model_manager.model_file(MOGE_FILE))).eval()`, and `with torch.inference_mode():` with `out = _moge.infer(torch.from_numpy(small.astype(np.float32) / 255).permute(2, 0, 1), use_fp16=False)`; replaced `n = out["normal"].cpu().numpy().astype(np.float32)`, `z = out["depth"].cpu().numpy().astype(np.float32)` and `fx = float(out["intrinsics"].cpu().numpy()[0, 0])` (now plain arrays).
- Checked on a scratch engine with pip replaced by a stub: install 202, a second POST answered the same job, cancel ended it, the next run reached done; `/runtime` ready and `/engines` moge true; a stub MoGe in the runtime gave the same normals, depth and focal as the in-process path. Not run: a real PyTorch install (1 to 2 GB) or the GitHub moge package; Marigold still needs the packages in the engine itself; each runtime call loads the model again.

## WBMP, DDS and Cineon read · _v1.87.7 (app/services/wbmp.py, app/services/cin.py, app/services/imaging.py, app/routers/io.py)

CLOSE_GAPS P15.

- `wbmp.py` (`looks_like_wbmp`, `read`, `WbmpError`) and `cin.py` (10-bit left-justified, packed, 8, 12 and 16-bit, the density curve from `dpx.py`), new. `imaging.py` routes .wbmp in `_sniffed` and .cin in `decode_to_png`; DDS goes to Pillow. Replaced: `from app.services import camera_profiles, dcp, dpx, fits, ico, pnm, qoi, tga` and `except (qoi.QoiError, pnm.PnmError, tga.TgaError, ico.IcoError) as exc:` (both gained the new modules). `io.py` `decode_deep` reads Cineon at 16 bits (the import was `from app.services import camera_profiles, dpx, fits, imaging, pnm`).
- Measured: WBMP 13 x 3 alternating 0 and 255; DXT5 DDS 8 x 8 (206,28,57); Cineon 4 x 2: R 685 to 255, G 95 to 0, B 400 to 90, `/decode-deep` 64 bytes at 16 bits.

## BMP, FITS and WBMP written; PNG level and JPEG subsampling · _v1.87.6 (app/services/fits.py, app/services/imaging.py, app/routers/io.py)

CLOSE_GAPS P16. Only additions.

- `fits.py` `write`: a primary HDU, BITPIX 8, three planes or one grey plane, rows bottom-up, padded to 2,880 bytes. `imaging.py` `ENCODINGS`, `_flat_white`, `_wbmp`, and `encode` branches for bmp (32-bit with alpha or 24-bit on white), fits, wbmp, png (compress level, optimize) and jpeg (subsampling). `io.py` `EXPORT_TYPES` gains fits and wbmp.
- `tests/test_api.py` `test_encode_refuses_unknown_formats_and_bad_images` used bmp as the unknown format; bmp is real now, so it sends xyz (was `data={"format": "bmp"}).status_code == 415`).
- Measured with curl and Pillow on a scratch engine: FITS RGB plane [200,30,30] at (5,5) on a 37 x 21 picture; PNG level 0 3,218 bytes, level 9 225; JPEG 4:4:4 read back with sampling 0.

## Patent guard: the declined feature cannot come back unnoticed · _v1.87.6 (setup/line_counts.py, CLAUDE.md, .claude/skills/formvis-harness/SKILL.md)

The owner: Content-Aware Scale and its skin-tone protection must not come back and are declined for patents.

- `line_counts.py` `DECLINED` (content-aware-scale, contentAwareScale, ContentAwareScale, Content-Aware Scale, /api/seam, /seam/, seam carving, carve_width, carveWidth, Protect skin tones) and `declined_problems()`: product code under frontend/src (not the translation tables, which keep their unused strings on purpose), backend/app, src-tauri/src and native that names it fails `./formvis counts --check`. `check()` returns it beside the scrollbar problems (was `return problems + scrollbar_problems(root)`). Checked on a scratch clone: adding `contentAwareScale` to a frontend file and "seam carving" to a backend file gave 2 problems and exit 1; the real tree passes.
- `CLAUDE.md` and harness law 10 state the ban with the patent numbers and the two related warnings (no Poisson blending after the adaptive Content-Aware Fill; no live fill during the Content-Aware Move drag). The ledger marks PC-UI-0071, PC-UI-0937 and PC-EN-0216 declined.

## Gray files decoded with their profile · _v1.87.5 (app/routers/io.py)

CLOSE_GAPS D37. Only additions.

- `io.py` `decode_gray` (`POST /api/io/decode-gray`, after `decode_cmyk`): the gray and alpha bytes of an 8-bit L or LA file and its embedded profile when it is a GRAY profile; 204 for 16-bit, multi-page or not gray.

## Model routes: remove, download sources, the Relight depth model's state · _v1.87.5 (app/localgen/model_manager.py, app/localgen/relight_split.py)

CLOSE_GAPS D36, D39 and D42. Only additions apart from one dictionary line.

- `model_manager.py`: `DELETE /api/models/{model}` removes a model's files and sidecars (409 for the generation models managed elsewhere, the safety filter, or one downloading); `GET /api/models/sources` (`{models: {id: {mode, url}}}`) and `PUT /api/models/{model}/source` with `SourceBody` (`mode` upstream, mirror or custom; 400 for a missing or non-http(s) URL, 404 for an unknown model) write `sources.json`, which `source_for` already read. The line `"license": "CreativeML Open RAIL++-M", "downloadGB": 5.2}` gained a following entry.
- `relight_split.py` `/engines` also answers `moge` and `mogeModel` (`_moge_ready`).
- Measured on a scratch engine: the sky model downloaded (176 MB, checksum checked) and DELETE left it not ready; DELETE on a managed model 409; PUT mirror wrote `{"skyseg":{"mode":"mirror","url":"https://mirror.example.com/m/"}}` and the next download went to the mirror host; PUT upstream reset it.

## NOTICE.md replaced with the owner's reviewed version · _v1.87.5 (NOTICE.md)

The owner's licence review (2026-10-19, against `src-tauri/Cargo.lock`, a clean install of both requirements files, the wheels' native libraries and the shipped npm packages) supplied a complete NOTICE.md (817 lines), used as given (it replaced the 235-line file: new rows for fontdb, @tauri-apps/api and onnx, OpenEXR moved into Distributed, and the sections for the shell's crates, the engine's Python packages, native libraries in the wheels, required credits, LGPL source with the written offer, the Linux AppImage and keeping the file current). Changed by hand after: the shell row names tauri-plugin-single-instance, a table "Added with tauri-plugin-single-instance (1.87.4)" lists its 33 crates with their licences from `cargo metadata`, and the DNG specification row names the document without its publisher. The FreeType credit's year 2026 matches 2.14.3 (packaged in April 2026). New beside it: `licenses/` (233 files, 4.6 MB: python/ 49 distributions, python-ml/ 50, npm/ 10, onnxruntime-ThirdPartyNotices.txt, and the crate pages rust-src-tauri.html (598 crates) and rust-formvis-render.html (139) made with cargo-about 0.9.2), `setup/collect_licenses.py` that regenerates it, `src-tauri/about.toml` and `about.hbs`, and `"resources": { "../licenses": "licenses" },` added to `bundle` in `tauri.conf.json` (checked with `cargo check`, which copied the folder; no full `tauri build` run). flatbuffers, antlr4-python3-runtime and cuda-toolkit carry no licence file in their wheels or sources, so they are listed, not invented.

## /api/seam removed · _v1.87.5 (app/routers/seam.py deleted, app/main.py)

The owner's patent review: seam carving falls under US 7,477,800 (active until about 2027-03-06) and the skin-tone protection under US 8,290,300 (until about 2031-05-12).

- Deleted `app/routers/seam.py` (140 lines: `_energy`, `_seam`, `_remove`, `_insert`, `carve_width`, `carve`, `skin_mask`, `POST /content-aware-scale`, `PROTECT = 1_000_000.0`, `MAX_PIXELS = 12_000_000`). Its full text is in git: `git show v1.87.4:backend/app/routers/seam.py`.
- `main.py` removed:

```python
from app.routers import seam as _seam  # noqa: E402  (1.55.4)
app.include_router(_seam.router, prefix="/api/seam")   # Content-Aware Scale (1.55.4, M4)
```

- The frontend's `engine/neural.ts` `skinMask()` and Skin Smoothing stay: not seam-based. Tests named for seams test tile edges, not seam carving.
- Warnings for future work: no gradient-domain (Poisson) blending after the adaptive Content-Aware Fill (US 8,861,868, claim 1); no live fill of the vacated area during the Content-Aware Move drag (US 9,575,641, claim 1).

## Animation frames route · _v1.87.5 (app/services/imaging.py, app/routers/io.py)

CLOSE_GAPS D38. Only additions.

- `imaging.py` `MAX_ANIMATION_FRAMES = 500`, `frames(data, filename)`: a GIF or WebP of two or more frames, each seeked and converted to RGBA (Pillow applies disposal and blending), as PNGs with width, height, plays and per-frame delays; None for one frame; refused past 500 frames or the megapixel limit in total. `io.py` `POST /api/io/frames` (`animation_frames`): a 4-byte length, a JSON header, then the PNGs, as /exr-parts answers.
- Measured: GIF delays 100/250/400 and plays 0; WebP the same delays and plays 3; GIF with no loop block plays 1; one frame answers `{count: 1}`.

## Every export type allowed in the desktop app; Artboards to PDF embeds the profile · _v1.87.5 (app/routers/io.py, app/services/pdf_icc.py)

CLOSE_GAPS D35 and D41.

- `io.py` `EXPORT_TYPES`: one tuple of the 51 extensions the window writes (png, jpg, jpeg, webp, avif, tif, tiff, bmp, gif, pdf, svg, ai, eps, qoi, tga, ico, dpx, pbm, pgm, ppm, pnm, pam, exr, hdr, psd, psb, ora, fvd, fmv, formvis, mp4, webm, zip, cube, 3dl, csp, look, lut, json, csv, txt, atn, abr, grd, aco, ase, act, pat, csh, asl, sh); `EXPORT_NAME` and `OUTPUT_KINDS` are built from it, so /io/export, /io/write-path and /io/outputs agree. Replaced:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|fvd|fmv|formvis|webp|tif|tiff|pdf|avif|dpx|psd|qoi|pbm|pgm|ppm|pam|tga|ico)$", re.IGNORECASE)
OUTPUT_KINDS = (".png", ".jpg", ".jpeg", ".webp", ".avif", ".tif", ".tiff", ".pdf", ".psd", ".psb", ".fvd", ".fmv", ".gif", ".qoi", ".tga",
                ".ico", ".dpx", ".pbm", ".pgm", ".ppm", ".pam", ".exr", ".mp4", ".zip", ".svg")
```

- `pdf_icc.py` `embed_rgb_profile(pdf, icc)`: rewrites Pillow's PDF with the profile as one ICCBased stream that every page image uses (JPEG and JPEG 2000 layouts). `io.py` `pdf_pages` reads the profile once, embeds an RGB one and answers `X-ICC: embedded` or `skipped`. Replaced: the docstring's ``to JPEG at 100 when the engine's Pillow has no JPEG 2000). `icc` is checked and then not embedded: Pillow's PDF`` and `writer carries no profile."""`, `ImageCms.ImageCmsProfile(io.BytesIO(icc.file.read()))`, `return Response(out.getvalue(), media_type="application/pdf")`.
- Measured on a desktop-mode scratch engine: 31 export names 200 (before, the old pattern refused gif, mp4, webm, ora, psb, hdr, exr, ai, zip, cube, 3dl, csp, json, csv, txt, atn, abr, grd, aco, ase, pat and sh); exe, bat, js, html, `.hidden.png`, `../../evil.exe`, `a:b.png`, no extension and `a.png.exe` 400; `../../x.png` lands inside Exports. PDF: ICCBased 0 to 2, profile bytes once, `qpdf --check` clean, a Lab profile skipped.

## Profiles in 16-bit and banded exports · _v1.87.4 (app/routers/io.py, app/routers/bands.py)

CLOSE_GAPS D14 remainder.

- `io.py` `encode_deep` takes optional `icc` and `icc_name`: a PNG gains an iCCP chunk after IHDR; a TIFF with a profile is written by tifffile (zlib, unassociated alpha, tag 34675). Without a profile the output is as before. Replaced: `def encode_deep(file: UploadFile = File(...), width: int = Form(...), height: int = Form(...), format: str = Form("png")) -> Response:`, its docstring `"""A 16-bit PNG or TIFF from RGBA, 16 bits a channel, little-endian (1.53.6, H1)."""` and `return Response(out.tobytes(), media_type={"png": "image/png", "hdr": "image/vnd.radiance", "exr": "image/x-exr"}.get(format, "image/tiff"))`.
- `bands.py` `begin(request, width, height, ppi, name)`: a request body of ICC bytes is written as iCCP. Replaced: `async def begin(width: int, height: int, ppi: float = 72.0) -> dict[str, str]:` and `"""Opens a PNG of `width` by `height` RGBA pixels at `ppi`; rows follow, top first."""`.
- Measured with Pillow: banded PNG with a profile carries the 588-byte source profile, without one none; 16-bit PNG uint16 with iCCP; 16-bit TIFF tag 34675, 16 bits per sample.

## Other products' names out of the engine's comments · _v1.87.4 (app/routers/io.py, app/routers/merge.py, app/routers/video.py, app/services/camera_profiles.py, app/services/dcp.py, app/services/imaging.py)

CLOSE_GAPS P26, the owner's rule. Comments and docstrings reworded to name the file format or specification instead of a product (for example "as the TIFF specification and Photoshop have them" is now "as the TIFF specification has them"; "Photoshop's layout" is "the PSD layout"; "the folder Adobe's converters keep theirs in" is "the shared system folder other raw converters keep theirs in"). Kept on purpose because they are identifiers the code needs: the IANA PSD media type `image/vnd.adobe.photoshop` (io.py, twice), the camera profile names matched in `PREFERRED`, and the system folder paths the shared camera profiles live in (camera_profiles.py).

## MCP arguments checked, paths confined, cancel honoured; SAM device; vignette removal · _v1.87.3 (app/routers/mcp.py, app/routers/system.py, app/routers/merge.py)

CLOSE_GAPS P05 (D31, D32, D33, D22). Window side: `ui/panels/align-blend-dialog.ts` `removeVignette`, `VignetteGain`.

- D31 `mcp.py`: `SCHEMAS`, `_typed`, `_invalid` validate every call against the tool's input schema (unknown keys, missing required, types, ranges, enums, patterns, nested items) and answer a tool error naming the argument and the allowed values; `notifications/cancelled` cancels a pending call (`_cancel`, `_inflight`, `_cancelled`; error -32800). The POST handler's `return Response(status_code=202)   # a notification` became a branch for cancels, and `out = _ok(req_id, await _agent_call(_client_of(request, params, sid)[0], name, args), modern)` became validate then run as a task kept in `_inflight`.
- D32: `_OVERWRITE`, `_FILES`, `_system_roots`, `_inside`, `_confined`, `_refused`; `_path(raw, kinds, reading, overwrite=False)` resolves symlinks, refuses system folders and an existing file unless `overwrite: true` (added to the save_project, export_image and timeline_render schemas). Replaced head of `_path`:

```python
    path = Path(os.path.expanduser(str(raw or "").strip()))
    if not str(raw or "").strip() or not path.is_absolute():
        raise ValueError("Give an absolute path, for example /Users/you/Pictures/photo.png (~ works too).")
    if path.suffix.lower() not in kinds:
        raise ValueError(f"{path.name}: formvis takes {', '.join(sorted(kinds))} here.")
    if reading and not path.is_file():
```

  and the four call sites' literal suffix sets (`_PICTURES | _PROJECTS`, `{".png", ".jpg", ".jpeg", ".webp"}`, `{".mp4", ".gif", ".zip"}`, `{".fvd"} if name == "save_project" else set(_EXPORTS)`), now `_FILES[name][0]`; the three "replacing a file there" texts.
- D33 `system.py` `_select_object`: the ONNX branch reports cpu, cuda or mps from the first provider. Replaced: `return {"available": True, "model": "SAM 2.1 tiny", "device": "onnx", "reason": "ONNX Runtime" if model_manager.ready("sam2-onnx") else "ONNX Runtime; the model (about 155 MB) downloads on first use"}`.
- D22 `merge.py` `align`: `_vignette_gains`, `_LUT`, `_MAX_GAIN` fit one radial falloff from the aligned overlaps and return `gains`; the window applies them. Replaced the docstring's "vignette removal is not done." and `return {"matrices": out, "layers": info, "vignette": "not applied" if vignette else "off"}`.
- D16 (window): `engine/abr.ts` `readDescSpacing` (spacing from the brush descriptor, was a fixed `spacing: 0.25` for version 6 and later), `io/brush-library.ts` passes it, `engine/brush-dynamics.ts` `BrushPreset.spacing`, `engine/index.ts` `applyBrushPreset` sets it (was `this.brushShape = { ...this.brushShape, angle: preset.angle ?? 0, roundness: preset.roundness ?? 100 };`).
- Measured: 'verticle' answers "use one of: horizontal, vertical."; /etc, /usr, symlinks to /etc refused, /tmp and home allowed, an existing file refused without `overwrite`; vignette pairs: mean error 21.8 to 2.7 and 17.3 to 3.0; ABR spacing 60 kept, v6 descriptor 80 and 10 read as 0.8 and 0.1. Backend suite: 111 passed, the two real-model tests fail for missing models. Not tested: Windows paths, a real version 6 ABR file.

## Palette PNG for Image Assets · _v1.87.3 (app/services/imaging.py)

- D23: `ENCODINGS` gains `png8`; `encode` quantises RGBA to 256 colours (fast octree, Floyd-Steinberg) and writes a palette PNG with transparency in its palette and the given ppi. The branch `if fmt == "tiff":` became `elif`. Checked: a 64 x 64 noisy RGBA with a transparent band came back mode P with `transparency`, 4,790 bytes against 16,405 for the full-colour PNG.

## Home's file details and stand-in thumbnails · _v1.87.1 (app/routers/io.py, app/routers/projects.py, app/services/project_format.py)

- `io.py`: `POST /io/stat` (`{paths}`, at most 200, behind `_local`): size, modification time and whether each file exists.
- `project_format.py`: `stand_in_thumbnail(data)`, the bottom picture layer at 512 px for a project saved before thumbnails. `projects.py` `thumbnail` falls back to it (was `pf.read_thumbnail(target.read_bytes())` alone). The owner's .fmv answers 200 with a 242 KB PNG.

## .fvd projects, thumbnails, files by path · _v1.87.0 (app/routers/projects.py, app/routers/io.py, app/routers/mcp.py, app/services/project_format.py, tests/test_api.py, tests/test_legacy.py)

CLOSE_GAPS P01. The owner's saved project (`2CD3A33C-....fmv`, 4 layers, a Relight layer) opens through `/projects/library`, `/projects/import` and the new `/projects/open-path`; the failure he saw was the window sending a whole folder to `/projects/import`.

- `projects.py`: `EXT` is `.fvd`, `OLD_EXTS` is `(".fmv", *legacy.PROJECT_EXTENSIONS)`. Replaced:

```python
#: The library writes .fmv; projects with the extensions from before the rename (core/legacy.py) are still read, listed,
#: opened and deleted, and saving one again writes .fmv in its place.
EXT, OLD_EXTS = ".fmv", legacy.PROJECT_EXTENSIONS
```

- `projects.py` new: `_thumb`, `_local` (403 unless `X-Formvis: 1`; a foreign page cannot send the header past the CORS preflight), `_disk_path`, `_write_atomic`, `POST /projects/save-to`, `POST /projects/open-path`, `GET /projects/thumbnail`. `save` and `package` take a `thumbnail` upload. `save`'s write moved into `_write_atomic`; removed from `save`:

```python
    blob = pf.write_zip(data, assets)
    fd, tmp_name = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(blob)
        os.replace(tmp_name, target)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise
```

  and from `package`: `return Response(pf.write_zip(data, assets, root), media_type="application/zip")`.
- `project_format.py`: `THUMBNAIL`, `MAX_THUMBNAIL` (4 MiB); `write_zip(..., thumbnail=b"")` writes `thumbnail.png` beside the manifest when it is a PNG; `read_thumbnail(data)`. Readers before 1.87.0 skip the entry (`_collect` reads only `manifest.json` and `images/`).
- `io.py`: `EXPORT_NAME` takes `fvd`; new `DISK_KINDS`, `OUTPUT_KINDS`, `POST /io/read-path`, `POST /io/write-path`, `GET /io/outputs` (the exports folder and one level down, newest 200).
- `mcp.py`: `save_project` writes `.fvd`; `open_file` takes `.fvd` and `.fmv`; `agents sync` regenerated the tool reference.
- Tests: the two library tests now expect `.fvd` where they expected `.fmv` (the contract changed on purpose); 111 of 115 pass, the 2 real-model tests need models not installed here, the README count was stale before this change (14,600 against about 15,000) and is now 15,150.

## Stale unpack folders swept at start · _v1.86.3 (formvis_engine.py)

- The owner's Mac after the 1.86.2 checks: no `formvis-engine` process running, 31 `_MEI` folders in `$TMPDIR`, about 5.3 GB (116, 337, 338, 406 and 916 MB ones, one size per build of the day, and 12 empty). The servers had not outlived the app, but nearly every launch left its folder. The 1.86.0 launcher's name template is `%s_MEI%08xXXXXXX` (from its strings): the launcher's pid in hex, then six random characters.
- `sweep_stale_unpacks()` (new), called in `main` after `watch_parent()`: in the frozen engine on POSIX, a daemon thread lists the folder holding `sys._MEIPASS` and removes every `_MEI([0-9a-f]{8})[A-Za-z0-9]{6}` folder but its own whose pid is gone (`os.kill(pid, 0)` raising `ProcessLookupError` or `PermissionError`). Checked on mock folders: dead full and dead empty removed; a live pid, its own folder, an old-style `_MEI89Pw8z` and a non-`_MEI` folder kept.

## The frozen engine stops with the app · _v1.86.2 (formvis_engine.py)

- `watch_parent()` (new), called first in `main`: on POSIX, a daemon thread polls `os.getppid()` every 2 s; when the parent changes (the one-file launcher was forced closed), it removes `sys._MEIPASS` if that folder is a `_MEI` one and calls `os._exit(0)`. The 1.86.0 engine is a 320 MB one-file bundle that unpacks 997 MB (3,164 files, 843 MB of native libraries, torch's CPU library alone 386 MB) at every launch; the shell's forced stop reached only the launcher, so the server and that folder could outlive the app. The unpacking itself still happens each launch (DEV_PLAN 37.53, a one-folder build).

## The room's own light · _v1.85.0 (app/localgen/relight_scene.py, relight_split.py)

- `solve`: the room's shading is second-order SH over its normals (three robust reweightings) times `exp(blur(log(Y / SH), size / 12))` filled across the subject, normalised at the room's 75th percentile and clamped 0.35 to 1.5 (replaced the room's flat `+ (1 - mask)` shading of 1). Room normals are MoGe-2's where the room is seen, filled smoothly behind the subject (`_fill` per channel; replaced only the slope of the blurred layer). The room layer's depth is blurred at `size / 100` (was `size / 30`).
- `relight_split.py`: the full-size shading clamp is 0.15 to 1.6 (was 0.15 to 1.3) so a bright window side keeps its range.

## The scene in camera space · _v1.84.0 (app/localgen/relight_scene.py, relight_split.py)

- `relight_scene.py`: `_moge_scene` (replaces `_moge_normals`) returns MoGe-2's normals, metric depth (0 and unsure where MoGe masks it, such as sky), that mask and the focal length as a fraction of the width. `solve` works in log distance: unsure and stray pixels (more than 0.08 from a 5-pixel median) refilled with `_fill`, the subject's median at 1; without MoGe, Depth Anything's relative depth becomes `1 / (0.3 + 0.7 d)` with a focal of 1.2. Two layers as before, now `zs` and `zb`; the subject's `thickness` is its width over the focal (0.08 to 0.8) and the background is kept at least that far behind it. Normals from depth slope come from `_slope_z_normals(z, fpx)` (`n = (gx f / z, gy f / z, 1)`). The result gains `focal`, `thickness`, `bg_depth`, `bg_normals`; `depth` is now distance, not nearness. Removed:

```python
def _slope_normals(d: np.ndarray, size: int, relief: float = 0.7) -> np.ndarray:
    gy, gx = np.gradient(_blur(d, 1.2) * relief * size)
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)
```

and in `solve` the nearness pipeline (`d = _depth(g)`, `med = cv2.medianBlur((d * 255).astype(np.uint8), 5)...`, `bg = np.minimum(bg, subj - 0.03)`, `n_sub = _moge_normals(g)`, `n_bg = _slope_normals(bg, size)`), as at tag v1.83.0.
- `relight_split.py`: `extra` and `pack` carry `bg_depth` (f16) and `bg_normals` (f16 x 3) after the texture, `focal` and `thickness` in the header.

Verified on the benchmark portrait: MoGe-2 focal 1.74 of the long side, subject 0.87 to 1.05, background median 2.32, thickness 0.26.

## Texture for glints · _v1.83.0 (app/localgen/relight_scene.py, relight_split.py)

- `relight_scene.py`: `texture`, the photo's fine detail (`|g - blur 1.5| + 0.5 |g - blur 4|` on the square root of luminance, blurred 0.8, over its 95th percentile, times the subject mask x 1.5), in the result dict; the shading clamp is 0.4 to 1.3 on the grid (replaced `np.clip(S, 0.15, 1.3)`).
- `relight_split.py`: `extra` carries `texture`; `pack` writes it as u8 after the mask.

## Relight's scene · _v1.82.0 (app/localgen/relight_scene.py new, relight_split.py, model_manager.py, requirements_relight.txt, tests/test_localgen_krea2.py)

- `relight_scene.py` (new): `solve(rgb)` on a grid of at most 832 cells: Depth Anything depth with stray outline pixels (more than 0.08 from a 5-pixel median) refilled (`_fill`, normalised blurs coarse to fine); the subject from U2-Net (`services.background._u2net_onnx`, soft-thresholded); two layers, the subject's depth extended past its outline and the background's filled behind it, blurred at size/30 and kept 0.03 behind the subject; normals from MoGe-2 small (`_moge_normals`, `MoGeModel.infer(..., use_fp16=False)` at a short side of 518, OpenCV frame turned to Relight's: x, y, -z) for the subject, else the slope of its layer, the background's from its layer; the original light as second-order SH of the smoothed luminance over the subject's normals, fitted with four robust reweightings, normalised at the subject's 90th percentile, clamped 0.15 to 1.3, 1 on the background; `level`, the mean luminance of photo over shading on the subject. MoGe ran in 12 s on the CPU for the 464 x 832 grid.
- `relight_split.py`: `_scene_split` (albedo = photo / upsampled shading, signed residual, plus depth, mask, level, geometry) replaces `_classic` in `_split` (replaced: `result = _marigold(rgb) if engine == "marigold" else _classic(rgb)`); `pack` takes the optional fifth element and writes depth (f16) and mask (u8) after the normals with `scene`, `level`, `geometry` in the header (replaced: `albedo, shading, residual, normals = result` and the header line). `_classic` and its helpers stay for a later fallback.
- `model_manager.py`: MODELS `moge-2-vits-normal` (MIT, optional) and its PINNED hash (79a16621...); `requirements_relight.txt` gains `moge` at commit 74fbce05.
- `tests/test_localgen_krea2.py`: the optional allow-list gains `moge` (replaced the `startswith(("krea", "flux2-klein", "marigold"))` tuple).

Verified: 112 tests pass; `test_the_real_lama_fills_a_hole_from_its_surroundings` fails for want of the LaMa download here, as at 1.75.0.

## Relight split, finer face normals · _v1.78.0 (app/localgen/relight_split.py)

- `_shading`: a non-skin material is normalised at its 75th percentile, skin still at the 96th (hair sheen read as fully lit made the rest of the hair look shadowed and lifted it). Replaced: `level = float(np.percentile(est[core], 96)) if core.sum() > 100 else float(est.max())`.
- `_normals`: depth gradients averaged over a tenth of the face width, not a fifth, so the nose and cheeks shape the light. Replaced: `r = max([f["box"][2] for f in faces], default=s / 26) / 5`.

## Relight keeps the subject · _v1.76.0 (app/localgen/relight_split.py, app/localgen/model_manager.py)

The owner on 1.75.0: Marigold's albedo "is not the same face at all", and every split so far was "isolation and layered segment filtering" that degraded the subject. The classic engine is rewritten so the albedo is always `photo / shading` with a smooth shading field, so identity is the original's by construction; residual is signed and rebuilds the photo exactly (max error 6e-8).

- `relight_split.py`: new `KEEP_SIDE` (1024, the working side), `PARTS`, `PARTS_FILE`, `_parts_session`; `_blur`; `_faces` (YuNet via `face.find_faces` when `yunet-face` is ready); `_materials` (MediaPipe selfie multiclass to background, hair, skin, clothes, refined by a guided filter on the luminance; without it, 5 chroma k-means clusters, skin index -1); `_features` (eyes from landmarks, lips by a* above the skin's median inside the mouth ellipse, after formlit's `ai/parts.py`); `_shading` (per material: fill outside it, close fw/12 then open fw/18 so lashes and nostrils drop and shadow edges stay, 4 bilateral passes at half size, a guided pass r fw/8 on the filled luminance so the penumbra ramp is followed, gaps over 0.2 log moved into the shading, normalised at the 96th percentile of the material; clamp 0.02 to 1.25); `_normals` (Depth Anything gradient normals, cliff-masked, plus a head ellipsoid per face blended by a smoothstep of its interior over hair and skin); `_classic(rgb)` (working-size estimate, guided upsample of the shading, deep-shadow deblock with chroma calmed, removed noise into the residual). `_split` key gains the readiness of the parts and face models; `split` chooses Marigold only when asked; `engines` reports `regions` (`parts` or `colour`) and `faces`.
- Removed, quoted in full:

```python
def _sam_regions(rgb: np.ndarray, key: str) -> np.ndarray | None:
    from app.services import segment

    if not segment.available():
        return None
    h, w = rgb.shape[:2]
    out = io.BytesIO()
    Image.fromarray(rgb).save(out, "PNG")
    try:
        segment.encode(key, out.getvalue())
    except Exception:
        return None
    labels = np.full((h, w), -1, np.int32)
    area = np.full((h, w), np.inf, np.float32)
    cols, rows, n = 6, 8, 0
    for j in range(rows):
        for i in range(cols):
            x, y = (i + 0.5) * w / cols, (j + 0.5) * h / rows
            try:
                with Image.open(io.BytesIO(segment.select(key, [(x, y, 1)]))) as m:
                    mask = np.asarray(m.convert("L")) > 127
            except Exception:
                continue
            mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
            size = float(mask.sum())
            if size < 0.01 * h * w:
                continue
            take = mask & (size < area)
            labels[take] = n
            area[take] = size
            n += 1
    if n == 0:
        return None
    if (labels < 0).any():
        _, nearest = cv2.distanceTransformWithLabels((labels < 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        seeds = np.zeros(nearest.max() + 1, np.int32)
        seeds[nearest[labels >= 0]] = labels[labels >= 0]
        labels = np.where(labels < 0, seeds[nearest], labels)
    return labels


def _chroma_regions(lin: np.ndarray) -> np.ndarray:
    chroma = lin / (lin.sum(-1, keepdims=True) + 1e-3)
    feat = (cv2.GaussianBlur(chroma, (0, 0), 2)[..., :2] * 12).reshape(-1, 2).astype(np.float32)
    _, _, centres = cv2.kmeans(feat[::7], 6, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1e-3), 2, cv2.KMEANS_PP_CENTERS)
    return ((feat[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1).reshape(lin.shape[:2]).astype(np.int32)


def _classic(rgb: np.ndarray, key: str) -> tuple:
    lin = _lin(rgb)
    size = max(rgb.shape[:2])
    log_y = np.log(_lum(lin) + 1e-3)
    r = max(2, size // 120)
    smooth = _guided(log_y, log_y, r, 0.02)
    smooth = _guided(smooth, smooth, r, 0.02)
    labels = _sam_regions(rgb, key)
    if labels is None:
        labels = _chroma_regions(lin)
    lit = np.zeros_like(smooth)
    for label in np.unique(labels):
        mask = labels == label
        if mask.sum() < 32:
            lit[mask] = smooth[mask].max()
            continue
        lit[mask] = np.percentile(smooth[mask], 92)
    lit = _guided(log_y, lit, max(2, size // 200), 0.05)
    shading = np.exp(np.clip(smooth - lit, np.log(0.04), 0.15)).astype(np.float32)
    shading3 = np.repeat(shading[..., None], 3, -1)
    albedo = np.clip(lin / shading3, 0, 1)
    return albedo.astype(np.float32), shading3, np.zeros_like(lin), None
```

  Replaced lines: `result = _marigold(rgb) if engine == "marigold" else _classic(rgb, "relight-" + key)`; `key = hashlib.sha1(data).hexdigest() + engine`; `use = "marigold" if engine in ("auto", "marigold") and marigold_ready() else "classic"`; in `engines`, `from app.services import segment` and `"regions": "sam" if segment.available() else "colour",`. Why the old split failed: the SAM grid cut one material into pieces each normalised to its own lit level, the edge-keeping smoothing kept eyes and brows in the shading, and the albedo clip at 1 lost highlights.
- `model_manager.py`: PINNED `selfie-multiclass/model.onnx` and MODELS `selfie-multiclass` (Apache-2.0, 16 MB), the hash matching formlit 0.45.3's pin and the real download.

Verified: `_classic` 3.5 s at 736x1326 and 6.0 s at 2208x3978 on the CPU; reconstruction error 6e-8; through the window with `relight.apply`, a key from the left and from the right move the face's shadow to the opposite side and the face stays the same person (full-size crops beside the original). Tests: 111 pass; `test_the_skill_is_in_step_with_the_catalogue` and `test_the_engine_reports_sam` fail at HEAD 1.75.0 too (agents sync needs the window; SAM reporting in this sandbox), `test_segment_onnx` passes alone.

## Relight's light split · _v1.75.0 (app/localgen/relight_split.py new, app/localgen/model_manager.py, app/main.py, requirements_relight.txt new, tests/test_localgen_krea2.py)

- `relight_split.py`: `runtime_ready`, `models_ready`, `marigold_ready`; `_run_once` (load one Marigold pipeline in bfloat16 from the fp16 files, run at 768 px resized by PIL with `processing_resolution=0`, release it: the pipeline's own bf16 resize raises NotImplementedError on the CPU, and two float32 pipelines beside SAM and Depth Anything were OOM-killed at 8 GB); `_marigold` (albedo from photo / shading where shading is above about 0.012 to 0.06, guided-filter cleaned, the model's albedo, level-matched, only below; normals with y flipped to image space); `_sam_regions` (6 by 8 prompts through `segment.select`, masks opened by 5 px, at least 1 percent of the picture, smallest wins, gaps filled from the nearest region with `distanceTransformWithLabels`); `_chroma_regions` (fallback); `_classic`; `_split` (two results cached by SHA-1 and engine); `pack`; routes `GET /api/relight/engines`, `POST /api/relight/split`.
- `model_manager.py`: PINNED rows for the 24 Marigold files (hashes of the small files computed from the downloaded snapshot, of the weights from the Hub's LFS oids, all re-checked by the real download); MODELS `marigold-iid-lighting` and `marigold-normals`, optional, licence CreativeML Open RAIL++-M, revisions 08c3930b and 09cfdd25.
- `main.py`: router registered. Replaced line: `for _router in (... _lg_style.router, _lg_face.router, _lg_sky.router):` (now with `_lg_relight.router` before `_lg_face.router`).
- `tests/test_localgen_krea2.py`, `test_every_krea_file_is_pinned_to_a_revision_and_kept_out_of_bulk_downloads`: the allow-list of optional models gains the `marigold` prefix. Replaced: `if "GPL" not in model_manager.MODELS[k]["license"] and not k.startswith(("krea", "flux2-klein")) and k != "nsfw-filter"`.

Verified: downloads through `/api/models/{id}/download` with every pin matching; `_marigold` 48.6 s, peak RSS 4262 MB; `_classic` 5.2 s; tests `-k "depth or local or model"` pass but for `test_the_real_lama_fills_a_hole_from_its_surroundings` (LaMa not downloaded) and `test_segment_onnx` (passes with `FORMVIS_MODELS_DIR` set). Version lines removed:

```text
__version__ = "1.74.1"
version = "1.74.1"
version = "1.74.1"
  "version": "1.74.1",
```

## Float depth for Relight · _v1.74.1 (app/localgen/depth.py)

Relight needs depth finer than 8 bits: at its relief one grey level is about 5 px of height, which banded the normals. `_normalised` (the model run and min-max scaling, shared), `depth_map` (unchanged PNG for Depth Blur), `depth_values` (float32 resized bicubically in mode F to the size asked, clipped 0 to 1), and `depth_local` gains query `fmt` (`png` default, `f32`), `width`, `height` (1 to 16384, else the picture's size); the f32 answer is little-endian bytes with `X-Depth-Width` and `X-Depth-Height`. Replaced:

```python
def depth_map(picture: Image.Image) -> Image.Image:
    rgb = picture.convert("RGB")
    width, height = rgb.size
    small = np.asarray(rgb.resize((SIZE, SIZE), Image.Resampling.BICUBIC), np.float32) / 255.0
    x = ((small - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    out = _run(x)
    d = np.asarray(out).reshape(SIZE, SIZE).astype(np.float32)
    lo, hi = float(d.min()), float(d.max())
    norm = (d - lo) / (hi - lo) if hi > lo else np.zeros_like(d)
    img = Image.fromarray(np.clip(norm * 255 + 0.5, 0, 255).astype(np.uint8), "L")
    return img.resize((width, height), Image.Resampling.BICUBIC)
async def depth_local(image: UploadFile = File(...)) -> Response:
```

Verified: the engine run locally with the pinned model (SHA-256 matched) answered 975,936 bytes for 368 by 663; backend tests `-k "depth or local"`: 25 passed, 1 failed (`test_the_real_lama_fills_a_hole_from_its_surroundings`, which needs the LaMa model downloaded first; unrelated). Version lines removed:

```text
__version__ = "1.74.0"
version = "1.74.0"
version = "1.74.0"
  "version": "1.74.0",
```

## Version only · _v1.74.0

No engine code changed in 1.74.0. MCP agents reach `relight.apply` through the existing `run_command` tool. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.73.0"
version = "1.73.0"
version = "1.73.0"
  "version": "1.73.0",
```

## Version only · _v1.73.0

No engine code changed in 1.73.0. Relight reuses `POST /api/depth/local` (Depth Anything V2 Small) as it is. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.8"
version = "1.72.8"
version = "1.72.8"
  "version": "1.72.8",
```

## Version only · _v1.72.8

No engine code changed in 1.72.8 (alpha). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.7"
version = "1.72.7"
version = "1.72.7"
 "version": "1.72.7",
```

## Version only · _v1.72.7

No engine code changed in 1.72.7. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.6"
version = "1.72.6"
version = "1.72.6"
 "version": "1.72.6",
```

## Version only · _v1.72.6

No engine code changed in 1.72.6 (close-out). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.5"
version = "1.72.5"
version = "1.72.5"
 "version": "1.72.5",
```

## A font not installed answers 204 · _v1.72.5 (routers/system.py, __init__.py)

- `routers/system.py`, `font_file`: a family with no file on this computer now answers 204 with `X-Formvis-Font: missing` instead of 404, since absence is an answer and a 404 makes the browser log a failed load. A bad family name is still 400. Replaced:

```python
    if path is None or path.suffix.lower() not in _FONT_TYPES or not path.is_file():
        raise HTTPException(status_code=404, detail=f"No font file found for {name}.")
```

- Version lines removed, the desktop shell's quoted too:

```text
__version__ = "1.72.4"
version = "1.72.4"
version = "1.72.4"
 "version": "1.72.4",
```

## Version only · _v1.72.4

No engine code changed in 1.72.4 (`tests/test_deep_io.py` now writes its EXR through `contained.encode_exr`; `/api/capabilities` already reported `dataDir`). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.3"
version = "1.72.3"
version = "1.72.3"
 "version": "1.72.3",
```

## OpenEXR through the binding when OpenCV has no codec · _v1.72.3 (services/contained.py, __init__.py)

- `services/contained.py`: the venv's OpenCV 5.0 ships no OpenEXR codec, so every single-part EXR decode and Export EXR returned nothing. `_decode_worker` and `_encode_worker` fall back to new `_binding_decode` and `_binding_encode` over the OpenEXR binding (3.5.2, already a requirement since 1.71.5), still inside the contained child; a round trip is exact for 3 and 4 channels. Replaced:

```python
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
        ok, out = cv2.imencode(".exr", np.ascontiguousarray(img))
        q.put(out.tobytes() if ok else None)
```

- `tests/test_deep_io.py::test_32_bit_hdr_exr_and_tiff_round_trip_past_white` still fails: the test itself calls `cv2.imencode('.exr')` in-process.
- Version lines removed, the desktop shell's quoted too:

```text
__version__ = "1.72.2"
version = "1.72.2"
version = "1.72.2"
 "version": "1.72.2",
```

## Version only · _v1.72.2

No engine code changed in 1.72.2. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.72.1"
version = "1.72.1"
version = "1.72.1"
 "version": "1.72.1",
```

## Version only · _v1.72.1

No engine code changed in 1.72.1 (the browser build works on the window's side; the engine's `/capabilities` is its one probe). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.9"
version = "1.71.9"
version = "1.71.9"
 "version": "1.71.9",
```

## Version only · _v1.71.9

No engine code changed in 1.71.9. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.8"
version = "1.71.8"
version = "1.71.8"
 "version": "1.71.8",
```

## Lab PSD writing, DEV_PLAN 36.11 · _v1.71.8 (routers/io.py, __init__.py)

- `routers/io.py`, new `encode_lab_psd` (`POST /io/encode-lab-psd`) after `encode_cmyk_psd`. psd-tools' own Lab writer converts from RGB, so the document is built as RGBA (keeping each layer's transparency channel), then `header.color_mode = ColorMode.LAB`, `header.channels = 3`, the composite planes set with `image_data.set_data`, and written with `psd._record.write(out)` (`psd.save` redraws the composite as RGB). Bytes as Photoshop stores them: L 0..255 for 0..100, a and b 0..255 with 128 neutral. Nothing replaced.
- Checked: written through `api.encodeLabPsd` and read back with `api.decodeLab`: header `8BPS`, colour mode 9, layer position and size kept, a pixel back as L 100, a 150, b 90, a transparent pixel at alpha 0.
- Version lines removed, the desktop shell's quoted too:

```text
__version__ = "1.71.7"
version = "1.71.7"
version = "1.71.7"
 "version": "1.71.7",
```

## Camera Raw white balance and preview, DEV_PLAN 36.21 · _v1.71.7 (services/imaging.py, routers/io.py, __init__.py)

- `imaging.py`, `_wb_kwargs` (new): as shot with no adjustment returns `{"use_camera_wb": True}`, as before; otherwise rawpy `user_wb` multipliers from as shot, daylight or a gray-world average (auto), times Temperature (2^(0.8 t/100) on red, its inverse on blue) and Tint (2^(-0.5 t/100) on green).
- `imaging.py`, `_raw_args` (new): validates `wb` and `bits`, clamps Temperature and Tint to -100..100; errors are `DecodeError`.
- `imaging.py`, `_raw`: `wb`, `temperature`, `tint`, `half`; a camera profile applies only with the plain as-shot white balance (an explicit profile with a custom white balance is a `DecodeError`). Replaced:

```python
                rgb = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.sRGB, output_bps=8)
```

  and `rgb = _profiled(raw, chosen)` became `_profiled(raw, chosen, half)`.
- `imaging.py`, `_profiled`: `half` to `half_size=half`. Replaced: `linear = raw.postprocess(use_camera_wb=True, output_color=rawpy.ColorSpace.raw, output_bps=16, gamma=(1, 1), no_auto_bright=True)`.
- `imaging.py`, `raw_deep` (new): 16 bits per channel sRGB RGBA little-endian, with `_check`'s size limit. `decode_to_png` passes the new arguments.
- `routers/io.py`, `decode`: form fields `wb`, `temperature`, `tint`, `bits`, `half` (defaults as before; with all absent the PNG is byte-identical); `bits=16` on a RAW returns octet-stream with X-Width, X-Height, X-Depth. Replaced:

```python
def decode(file: UploadFile = File(...), page: int = Form(0), camera_profile: str = Form("auto")) -> Response:
```

- Checked on `tests/fixtures/synthetic.dng`: full 64 by 48, half 32 by 24; a cool Temperature raises blue and green; Tint and Daylight change the output; 16 bits returns uint16 RGBA with alpha 65535; a bad `wb` and a profile with a custom white balance are refused. `pytest -k "raw or decode"`: 7 passed.
- Version lines removed, the desktop shell's quoted too:

```text
__version__ = "1.71.6"
version = "1.71.6"
version = "1.71.6"
 "version": "1.71.6",
```

## Version only · _v1.71.6

No engine code changed in 1.71.6 (the Object Finder reuses `/api/ops/select-object` and its embedding cache; the assistant reuses `/api/llm/chat`). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.5"
version = "1.71.5"
version = "1.71.5"
 "version": "1.71.5",
```

## Multi-part OpenEXR, DEV_PLAN 36.15 · _v1.71.5 (services/contained.py, routers/io.py, requirements.txt, requirements_macos.txt, NOTICE.md)

- `services/contained.py`, new `_parts_worker`, `MAX_PARTS` (64), `MAX_PART_PIXELS`, `is_multipart_exr`, `decode_exr_parts` (nothing replaced): the OpenEXR binding (3.5.2) reads every part inside a spawned child, like the OpenCV decode, so untrusted bytes are never parsed in the engine. Per part: name, size, data window offset relative to the canvas (part 1's display window joined with every data window), RGBA float32 (the `RGBA` or `RGB` group, else the first channel as grey with alpha 1). `is_multipart_exr` reads only the version flags (byte 5, bit 0x10), so a single-part file never starts the new child; `decode_exr` and `decode-deep` are untouched.
- `routers/io.py`, new route `exr_parts` (`POST /io/exr-parts`, before `encode_deep`): a 4-byte little-endian JSON length, JSON `{count, width, height, parts:[{name,width,height,x,y}]}`, then each part's RGBA as little-endian float32. One part, or a file the child cannot read as parts, answers `{count: 1}` and the window opens it the single-part way.
- `requirements.txt`: `OpenEXR==3.5.2` after tifffile; `requirements_macos.txt`: `OpenEXR` after tifffile. `NOTICE.md`: an OpenEXR (Academy Software Foundation) row, BSD-3-Clause.
- Checked: a three-part file (64 by 48; beauty ZIP with alpha, diffuse 32 by 24 at (10, 8) ZIPS without alpha, specular uncompressed) reads back with diffuse's red channel equal to its source; a single-part file answers count 1; garbage answers None. Over HTTP from the window the three names come back in order.

## Version only · _v1.71.5

No other engine code changed in 1.71.5. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.4"
version = "1.71.4"
version = "1.71.4"
 "version": "1.71.4",
```

## Version only · _v1.71.4

No engine code changed in 1.71.4 (Export As metadata reuses the window's XMP writer). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.3"
version = "1.71.3"
version = "1.71.3"
 "version": "1.71.3",
```

## Version only · _v1.71.3

No engine code changed in 1.71.3. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.2"
version = "1.71.2"
version = "1.71.2"
 "version": "1.71.2",
```

## Version only · _v1.71.2

No engine code changed in 1.71.2. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.71.1"
version = "1.71.1"
version = "1.71.1"
 "version": "1.71.1",
```

## Version only · _v1.71.1

No engine code changed in 1.71.1. Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.70.9"
version = "1.70.9"
version = "1.70.9"
 "version": "1.70.9",
```

## Version only · _v1.70.9

No engine code changed in 1.70.9 (Generative Fill's providers use the `provider` field `/generative/fill` has taken since 1.58.4). Removed version lines, the desktop shell's quoted too:

```text
__version__ = "1.70.8"
version = "1.70.8"
version = "1.70.8"
 "version": "1.70.8",
```

## Version only · _v1.70.8

No engine code changed in 1.70.8. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.70.7"
version = "1.70.7"
version = "1.70.7"
 "version": "1.70.7",
```

## Version only · _v1.70.7

No engine code changed in 1.70.7. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.70.6"
version = "1.70.6"
version = "1.70.6"
 "version": "1.70.6",
```

## Version only · _v1.70.6

No engine code changed in 1.70.6. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.70.5"
version = "1.70.5"
version = "1.70.5"
 "version": "1.70.5",
```

## Release 1.70.5 · _v1.70.5 (app/__init__.py)

Joined and probed: `GET /api/file` gave 200 for an image, 400 for a non-image suffix and 404 for a missing path; `cargo check --offline` clean with `pick_image_path`. The native dialog itself needs a desktop run to see. Removed version lines (the desktop shell's quoted too):

```text
__version__ = "1.70.4"
version = "1.70.4"
version = "1.70.4"
 "version": "1.70.4",
```

## Desktop link paths and slices · _v1.70.5 (app/routers/system.py, src-tauri/src/main.rs)

- app/routers/system.py, `linked_file` (`GET /api/file?path=`): returns the bytes of an existing regular file whose suffix is in `_LINK_IMAGE_SUFFIXES` (the extensions `pickLinkSource` lists), with a guessed media type and a Last-Modified header; 400 for another suffix, 404 for a missing or non-regular file.
- src-tauri/src/main.rs, `pick_image_path` (async command, `tauri_plugin_dialog::DialogExt`, `add_filter("Images", ...)`, `blocking_pick_file`): returns the picked file's disk path or None; registered in `generate_handler!` after `system_fonts`. The default capability needed no change (app commands are not gated by a capability without a build-time command manifest).

## Release 1.70.4 · _v1.70.4 (app/__init__.py)

Joined and probed: `POST /api/spell/check` answered "Helo" and "recieve" with suggestions in English and "mundoo" with "mundo" in Spanish, skipping NASA and x2; `POST /api/reveal` gave 404 for a missing path and 200 for a real one. Removed version lines (the desktop shell's quoted too):

```text
__version__ = "1.70.3"
version = "1.70.3"
version = "1.70.3"
 "version": "1.70.3",
```

## Reveal linked files · _v1.70.4 (app/routers/system.py)

- app/routers/system.py, `RevealBody` and `reveal` (POST /api/reveal): 404 when the path does not exist; macOS `open -R`; Windows `explorer /select,`; Linux `dbus-send` FileManager1.ShowItems, falling back to `xdg-open` on the parent folder (501 when neither exists). Popen, no shell. Logged at the join; the builder ran out of budget.
- Nothing removed.

## Check Spelling and missing fonts · _v1.70.4 (app/services/spell.py, app/routers/system.py, requirements.txt, requirements_macos.txt)

- app/services/spell.py, `check`, `_checker`, `_worth_checking`: new. A cached pyspellchecker `SpellChecker` per language (en, es, it; others use en); unknown words only, up to 6 suggestions, skipping numbers, words with digits, single letters and ALL-CAPS words up to 5 letters.
- app/routers/system.py, `SpellBody`, `spell_check`: new `POST /api/spell/check`, body `{words: string[], lang: string}`, answers `{unknown: [{word, suggestions}]}`.
- requirements.txt: `pyspellchecker==0.9.1`; requirements_macos.txt: `pyspellchecker`. The desktop lists hold only PyInstaller and are unchanged. NOTICE.md has the new row.
- Nothing removed.

## Version only · _v1.70.3

No engine code changed in 1.70.3. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.70.2"
version = "1.70.2"
version = "1.70.2"
 "version": "1.70.2",
```

## Version only · _v1.70.2

No engine code changed in 1.70.2. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.70.1"
version = "1.70.1"
version = "1.70.1"
 "version": "1.70.1",
```

## Release 1.70.1 · _v1.70.1 (app/__init__.py)

Checked: `tests/test_api.py` 16 of 16. Probed through the running engine: Inter, an installed font with a `frac` feature, came back from `/api/fonts/file`. The page registered it as `Inter__ot_<hash>` with `"frac" 1`, and "1/2 3/4" at 48 px rendered 111 px wide instead of 172 (the fractions set as single glyphs). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.9"
version = "1.69.9"
version = "1.69.9"
 "version": "1.69.9",
```

## Font file route, DEV_PLAN 32.6 part b · _v1.70.1 (app/routers/system.py)

`GET /api/fonts/file?family=X&bold=0|1&italic=0|1` returns a font file's bytes so the window can register a FontFace with OpenType features. It asks `fc-match` (list argument, no shell) and keeps the answer only when it is the requested family (fc-match otherwise answers with a fallback font), else scans the usual font folders for a file whose name holds the family. Only .ttf, .otf, .ttc, .woff and .woff2 files are read, served as font/ttf, font/otf, font/collection, font/woff or font/woff2; the request never names a path, and nothing found is a 404.

## Version only · _v1.69.9

No engine code changed in 1.69.9. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.8"
version = "1.69.8"
version = "1.69.8"
 "version": "1.69.8",
```

## Version only · _v1.69.8

No engine code changed in 1.69.8. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.7"
version = "1.69.7"
version = "1.69.7"
 "version": "1.69.7",
```

## Release 1.69.7 · _v1.69.7 (app/__init__.py)

Probed end to end: with the window open, `./formvis cli process cli_in.png --run invert --format png --out <dir> --suffix _cli --yes` opened the 30 by 20 picture (200, 40, 40), inverted it, exported `cli_in_cli.png` reading (55, 215, 215), moved it beside the input, and closed its document (the window's own two documents stayed open); exit 0. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.6"
version = "1.69.6"
version = "1.69.6"
 "version": "1.69.6",
```

## cli process and droplet · _v1.69.7 (setup/cli.py, formvis)

`./formvis cli process <input...>` reads each file, base64s it into `open-image-data`, runs the `--run id key=value` commands in order, then `--action` through `play-action`, then `export-to-file` named `<stem><suffix>.<format>`, always closes with `close-document`, and moves the exported file from the engine's exports path to `--out` (default beside the input) with `shutil.move`; it prints one line per file, exits 1 if any failed, and refuses risky commands without `--yes`. `./formvis cli droplet <action>` writes an executable `<action>-droplet.sh` with this repo's absolute path baked in, plus a `.cmd` twin calling `python setup\cli.py process %*`. The launcher's usage text names both. The engine is unchanged; the move assumes the CLI and engine share a machine.

## Version only · _v1.69.6

No engine code changed in 1.69.6. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.5"
version = "1.69.5"
version = "1.69.5"
 "version": "1.69.5",
```

## Version only · _v1.69.5

No engine code changed in 1.69.5. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.4"
version = "1.69.4"
version = "1.69.4"
 "version": "1.69.4",
```

## Version only · _v1.69.4

No engine code changed in 1.69.4. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.3"
version = "1.69.3"
version = "1.69.3"
 "version": "1.69.3",
```

## Release 1.69.3 · _v1.69.3 (app/__init__.py)

Checked: `tests/test_deep_io.py` and `tests/test_api.py` 18 of 19, the one failure the known 32-bit EXR round trip that fails on the baseline too. Probed through the running engine: a 16-bit FITS gave 60 by 40 at depth 16, the image's 1000 counts at 65535 and its zero floor at 0 after the flip; a -32 FITS gave depth 32 in 0 to 1; `/decode` turned the 16-bit file into an 8-bit picture that opened as a 60 by 40 document. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.2"
version = "1.69.2"
version = "1.69.2"
 "version": "1.69.2",
```

## FITS reader, DEV_PLAN 34.7 · _v1.69.3 (app/services/fits.py, app/routers/io.py)

New app/services/fits.py (numpy only): `is_fits`, `FitsError` and `read(data)` for the primary HDU in BITPIX 8, 16, 32, -32 and -64 with BZERO and BSCALE, NAXIS3 of 3 as RGB and otherwise plane 1 as grey, flipped bottom-up. It stretches on open (0.25 and 99.75 percentiles, NaN ignored, then asinh(10 x) / asinh(10)); integer data returns uint16 RGBA at 16 bits, floating point returns float32 RGBA in 0..1 at 32 bits. `/decode-deep` has a FITS branch beside the Netpbm one (415 on FitsError), and `/decode` turns a FITS file into an 8-bit PNG through the same reader.

## Version only · _v1.69.2

No engine code changed in 1.69.2. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.69.1"
version = "1.69.1"
version = "1.69.1"
 "version": "1.69.1",
```

## Version only · _v1.69.1

No engine code changed in 1.69.1. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.9"
version = "1.68.9"
version = "1.68.9"
 "version": "1.68.9",
```

## Version only · _v1.68.9

No engine code changed in 1.68.9. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.8"
version = "1.68.8"
version = "1.68.8"
 "version": "1.68.8",
```

## Version only · _v1.68.8

No engine code changed in 1.68.8. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.7"
version = "1.68.7"
version = "1.68.7"
 "version": "1.68.7",
```

## Version only · _v1.68.7

No engine code changed in 1.68.7. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.6"
version = "1.68.6"
version = "1.68.6"
 "version": "1.68.6",
```

## Version only · _v1.68.6

No engine code changed in 1.68.6. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.5"
version = "1.68.5"
version = "1.68.5"
 "version": "1.68.5",
```

## Version only · _v1.68.5

No engine code changed in 1.68.5. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.4"
version = "1.68.4"
version = "1.68.4"
 "version": "1.68.4",
```

## Release 1.68.4 · _v1.68.4

Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.3"
version = "1.68.3"
version = "1.68.3"
 "version": "1.68.3",
```

## Crop and Straighten Photos, DEV_PLAN 30.3 part b · _v1.68.4 (app/routers/merge.py)

Files: `app/routers/merge.py` (`crop_photos`, `POST /api/merge/photos`: background from the border median, colour-distance mask, close/open/erode, external contours above 1 percent, `minAreaRect` folded to -45..45, `getPerspectiveTransform` + `warpPerspective`; JSON `photos` of base64 PNG with `rect`). Nothing removed. Checked with TestClient on a 600 by 400 canvas, photos 200x140 at 8 degrees and 180x220 at -12: results 202x142 and 181x222.

## Release 1.68.3 · _v1.68.3

Engine tests: 108 passed, the seven known model and EXR cases failing. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.2"
version = "1.68.2"
version = "1.68.2"
 "version": "1.68.2",
```

## POST /api/merge/align and /api/merge/blend: Auto-Align and Auto-Blend Layers (DEV_PLAN 32.1) · _v1.68.3 (app/routers/merge.py)

`align` takes repeated `file` document-size RGBA PNGs (reference first), `projection`, `vignette`; SIFT (ORB if missing) with a 0.75 ratio test, then RANSAC `findHomography` (3 px) or, for reposition or when the homography is weak or implausible, a median-and-inliers translation. Answers `matrices` (row-major, layer to reference). `blend` takes `method` (`panorama`: layer farthest from its own edge; `stack`: largest blurred Laplacian energy), smooths the winner map with a Gaussian and normalises, answering base64 grey `masks` and `tones` gains over the overlap with the reference. Checked with TestClient: a copy shifted 12,7 gave -12.1,-7.0; two copies blurred on opposite halves gave masks near 248 on the sharp half and 10 on the other.

## POST /io/pdf-pages: Artboards to PDF (DEV_PLAN 29.4) · _v1.68.3 (app/routers/io.py)

`pdf_pages` takes repeated `file` PNGs plus `dpi`, `jpeg`, `quality` and an optional `icc`, flattens each on white and writes one PDF with Pillow `save_all=True, append_images, resolution=dpi`; pages may differ in size, each page is its pixels over dpi times 72 in points. Lossless encoding is RGBA saved as reversible JPEG 2000 (Pillow's PDF writer has no Flate for RGB), falling back to JPEG at quality 100 if that fails; some PDF viewers may not show JPEG 2000. The `icc` profile is checked with ImageCms and then NOT embedded, since Pillow's PDF writer carries none. Checked with TestClient: 288x144 and 100x200 PNGs at 144 dpi gave /MediaBox 144x72 and 50x100.

## Version only · _v1.68.2

No engine code changed in 1.68.2. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.1"
version = "1.68.1"
version = "1.68.1"
 "version": "1.68.1",
```

## Version only · _v1.68.1

No engine code changed in 1.68.1. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.68.0"
version = "1.68.0"
version = "1.68.0"
 "version": "1.68.0",
```

## Version only · _v1.68.0

No engine code changed in 1.68.0. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.9"
version = "1.67.9"
version = "1.67.9"
 "version": "1.67.9",
```

## Release 1.67.9 · _v1.67.9

Engine tests: 108 passed, the seven known model and EXR cases failing. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.8"
version = "1.67.8"
version = "1.67.8"
 "version": "1.67.8",
```

## QOI, Netpbm, TGA and ICO codecs, DEV_PLAN 34.1 · _v1.67.9 (app/services/qoi.py new, pnm.py new, tga.py new, ico.py new, imaging.py, app/routers/io.py, app/routers/mcp.py)

Four codecs written from the published specifications in numpy and the standard library (Pillow only encodes the PNG of an ICO entry, decodes a PNG entry and resamples; no new dependency, nothing for NOTICE). `qoi.py`: the 2022-01-05 spec, all six chunks, the 64-entry index, the 8-byte end marker, channels 3 or 4 (4 only when an alpha is below 255), the colourspace byte kept as a flag (informative, the numbers are not converted). `pnm.py`: P1 to P6 and P7 (BLACKANDWHITE, GRAYSCALE, RGB and the _ALPHA forms), comments, text with or without spaces for P1, maxval 1 to 65535, scaled to 8 bits or, above 255, 16; PBM's 1 is black, PAM's BLACKANDWHITE 1 is white; writes P4 (luma at half, transparency on white), P5 and P6 (luma 299/587/114, exact for gray, transparency on white), P7 (GRAYSCALE, GRAYSCALE_ALPHA, RGB or RGB_ALPHA by content), 8 or 16 bits. `tga.py`: types 1, 2, 3, 9, 10, 11, colour-map entries of 15, 16, 24, 32 bits, 8 or 16 bit indices with a first-entry offset, 15/16 (A1R5G5B5, alpha bit read only when the descriptor declares alpha bits), 24, 32 (a fourth byte that is all zero with no declared alpha bits is taken as opaque, as other readers do), 8-bit gray and 16-bit gray with alpha, image id, all four origins; writes 24 or 32 bits, bottom-left, run-length per scanline or not, 24 flattened on white, with the TGA 2.0 footer. `ico.py`: PNG and DIB entries (1, 4, 8, 16, 24, 32 bits, palette, 555 or bitfields, the AND mask used when a 32-bit alpha is all zero, top-down heights); the directory's size is not trusted (each entry's own header gives it); `listing` orders images largest first so page 0 is the largest; writes any of 1 to 256 as 32-bit BGRA DIBs with the AND mask (PNG for 256, or for all when asked), each size fitted in a square, centred, Lanczos on premultiplied alpha.

Routes: `imaging.decode_to_png` sniffs QOI and Netpbm by content, ICO and TGA by suffix plus a header check (TGA has no magic), before Pillow, so Pillow's own readers no longer see these; `pages` lists an ICO's images; `encode` takes `options` (a JSON form field on `/io/encode`: `linear`, `kind`, `bits` and `rle`, `sizes` and `png`); `/io/decode-deep` answers a PNM at its own depth (16 for maxval above 255, else 8); `/io/encode-pnm` writes a PNM from 16-bit RGBA; `EXPORT_NAME` allows the new extensions for the desktop export; `mcp.py` `_PICTURES` and the `open_file` description list the new suffixes (`agents sync` run). Limits are the engine's (`MAX_SIDE`, `MAX_PIXELS`); a bad file is a 415, a bad options object a 422.

Verified by scratch scripts outside the repo (no tests written): QOI against a reference decoder and a reference encoder written from the spec, 18 images (byte-identical output, both directions); PNM, 36 checks (hand-built P1 to P7, 16-bit, maxval 15 and 1000, Pillow-made files, writers decoded by Pillow, a 16-bit PGM round trip exact); TGA, 61 checks (hand-built colour-mapped, 15/16/24/32, gray, RLE, four origins; Pillow-written and Pillow-decoded files); ICO, 37 checks (hand-built DIBs of 1, 4, 8, 16, 24, 32 bits with masks, PNG entries, Pillow-written icons, my writer decoded by Pillow for all seven sizes in both modes), then 23 route checks through the test client. Engine tests 107 passed; the failures are the seven model and EXR cases and `test_agents_setup::test_the_skill_is_in_step_with_the_catalogue`, whose drift is in `commands.md` and `command-map.md` (the command catalogue changed under the other two engineers' work; `agents sync` regenerates them with the window open). Removed from backend:

```text
        import numpy as np
```

## Release 1.67.8: the first of Phases 29 to 35 · _v1.67.8

Joined and checked after the two builders: engine `tests/test_api.py` 16 passed; the browser tests nearest the change pass but for `test_duplicate_layer_dialog_names_the_copy_and_ctrl_j_stays_quick`, which fails the same on the unchanged 1.67.7 tree. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.7"
version = "1.67.7"
version = "1.67.7"
 "version": "1.67.7",
```

## POST /api/io/export takes a folder, DEV_PLAN 29.1 · _v1.67.8 (app/routers/io.py)

Layers to Files in the desktop app writes many files; an optional `folder` form field (one name, no separators, not starting with a dot or space, 100 characters at most; `EXPORT_FOLDER`) puts them in a folder made inside the exports folder, and a bad name is a 400. `psd` joins the allowed export extensions, which the one-layer PSD of Layers to Files needs. Without `folder` the route is as before.

## The project format, the project routes and the desktop shell's start rewritten from behaviour specs, DEV_PLAN 28.0 batch 28 · _v1.67.7 (app/services/project_format.py, app/routers/projects.py; src-tauri/src/main.rs)

Spec `cleanroom/batch-28-project-format-routes-shell.md`, 54 gaps, notes tagged Interface, Behaviour or Close, with an implementer who had not seen the old lines. Similarity, measured before placing: 21 of 54 identical, none of them a behaviour gap (route declarations, `close_splash`, `fn main` and the builder's run, all fixed by their interface). `project_format.py` as one whole-file write (about 85 percent changed), `projects.py` and `main.rs` as single-region edits. Review feedback as a compiler error only: the error dialog builder has no `title` before `message`; the line was removed in the repo by hand. Removed code: the earlier lines are not quoted, by the Phase 13 rule.

Verified: engine tests fail only as on the unchanged tree (the seven model and EXR cases); `cargo check` in `src-tauri` clean; the four browser test files that save, open or call the project routes pass but for `test_an_agent_edits_saves_exports_and_reopens`, which stops at its generative step for want of a local model or key here, before any project call. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.6"
version = "1.67.6"
version = "1.67.6"
 "version": "1.67.6",
```

## Release 1.67.6: DCP, display profile, presets and the sprint's close · _v1.67.6

The sections below were written by the engineers who built them this turn. Lead's checks after the joins: engine tests fail only as on the unchanged tree (seven: models absent here and this OpenCV's missing EXR codec); `cargo check` in `src-tauri` clean. Colour accuracy (Delta E 2000, 1,000 colours a pair, formvis against LittleCMS's own transform): every exact pair at or under 0.0028 except FOGRA39 to Lab D50 at 0.30, all under the 1.0 target; the 33-point RGB display table 0.79 to 1.17 at most (mean about 0.18); the 17-point FOGRA39 display table 2.05 at most on uniform random ink, over the 2.0 target, and 1.58 within 330 percent total ink. `FOGRA39L_coated.icc` matches TeX Live's colorprofiles copy; its copyright tag reads "free of known copyright restrictions" and CTAN gives zlib/libpng terms, so it ships (recorded in `NOTICE.md`). Removed:

```text
__version__ = "1.67.5"
version = "1.67.5"
version = "1.67.5"
 "version": "1.67.5",
```

## Every skill mirrored, references generated from the live catalogue, and the old skill pack removed, DEV_PLAN 28.8 and 28.9 (setup/agents.py; .claude/skills; AGENTS.md, CLAUDE.md, README.md, docs, .docs/wiki, NOTICE.md)

`setup/agents.py`: `sync` now mirrors every folder under `.claude/skills` that holds a `SKILL.md` into `.agents/skills` (and removes a `formvis-*` mirror whose skill is gone), and `install` copies every skill, not only `formvis-editing`, to `~/.claude/skills` and `~/.agents/skills`. Generated, so they cannot drift: `formvis-editing/references/tools.md` (the MCP catalogue, as before), `formvis-harness/references/tool-map.md` (each MCP tool, what it reads or changes, and the driving sub-skills that name it, `none` when no sub-skill does), and, from the window's mirror in `<data dir>/commands-catalogue.json` (the file `GET /api/commands` serves), `formvis-driving/references/commands.md` (every command: id, name, keys, what it does, and the exact parameters of the seven actions) and `formvis-harness/references/command-map.md` (counts per group with the harness sub-skill that owns it, and id families). Plug-in commands and the ten `recent-N` rows are left out and the labels that follow state (`undo`, `redo`, `toggle-*`) are written as the id, so the files do not change with what is open. With no catalogue file the two commands files are left as they are and a line says to open the window once. `sync --check` exits 1 on drift in any of these, in any mirror, and on a skill file that breaks the upload gates (a front matter name over 64 characters or description over 1024, an XML tag in either, an emoji, U+2014 anywhere in `.claude/skills`); all pass today.

`.claude/skills/formvis-skillset` (SKILL.md and eight sub-skills) is deleted: `grep -rn formvis-skillset` found only these logs, after `AGENTS.md`, `README.md`, `CLAUDE.md` and `docs/AGENT_EVALS.md` were pointed at `formvis-harness` and `formvis-driving`. Text brought up to date: `terminal-operator` (the dock, PTYs, the Claude Code panel and Agent Connect exist), `formvis-driving` (the command catalogue, `paint.stroke`), its `terminal` and `painting-and-brushes` sub-skills, `formvis-harness` `SKILL.md`. Docs: README features (terminal, Claude Code, command catalogue and CLI, DPX and Color Settings, Brushes, the native renderer), `docs/MANUAL.md` sections Terminal, Agents, The command line and Brushes plus Colour and Export bullets, wiki pages Terminal, Agents, Colour and Brushes with the sidebar and Home links, `NOTICE.md` rows for xterm.js and its fit addon, ptyprocess and pywinpty (LittleCMS and the 144 Rust crates were already listed; the crate rows match `cargo metadata` for `native/formvis-render`).

Removed from setup/agents.py:

```text
SKILL = ROOT / ".claude" / "skills" / "formvis-editing"
MIRROR = ROOT / ".agents" / "skills" / "formvis-editing"
```

## Release 1.67.5: review of the catalogue routes, the agent bridge and colour part 1 · _v1.67.5 (app/routers/commands.py)

The three sections below were written by the engineers who built them. Review: `POST /api/commands/catalogue` and `POST /api/commands/{cid}` now call `require_local` (the terminal router's loopback Host and Origin rule), because a cross-site form post with no JSON body would otherwise have reached `run`; the CLI, which sends no Origin from 127.0.0.1, still passes. Process breach, recorded as the colour engineer disclosed it: `convert_deep` and `profile_info` were appended to `app/services/colour.py` with a shell heredoc rather than a hand edit, against SEDO; the content was reviewed and kept. `tests/test_colour.py::test_rgb_documents_only_for_now` was changed by that engineer to expect a CMYK source to convert (it asserted the old refusal); no new test was written. Unverified here: black preservation between two different press profiles (only FOGRA39 ships), Gray and Lab against a reference, Follow Agent's view movement, and real Codex and Cursor clients.

Verified: engine tests fail only as on the unchanged tree (seven); `test_agents_setup` 3 of 3; `agents sync --check` in step; `counts --check` accurate. Removed lines taken after the version edit. Removed:

```text
__version__ = "1.67.4"
version = "1.67.4"
version = "1.67.4"
 "version": "1.67.4",
```

## The command catalogue's routes and the CLI, DEV_PLAN 28.3 (app/routers/commands.py new; app/main.py; setup/cli.py new, setup/line_counts.py, formvis)

`routers/commands.py`: `POST /api/commands/catalogue` keeps the window's catalogue in memory and in `<data dir>/commands-catalogue.json`; `GET /api/commands?group=&text=` lists it (with `live` and, when empty, how to fill it); `GET /api/commands/{id}` describes one (404 with near ids); `POST /api/commands/{id}` with `{ params }` hands the command to the window as the bridge's `run_command` message through `mcp._call` (consent, window start and timeouts are the MCP route's own) and answers `{ ok, result | error, risky }`. `mcp.py` is untouched.

`./formvis cli list [text] | describe <id> [kind=] | run <id> key=value ... [--yes]` (`setup/cli.py`, urllib only, `FORMVIS_URL` overrides the address). A command marked risky runs only with `--yes`. `./formvis counts --commands [--check]` reads the engine's catalogue file, because the ids are generated at run time (filters, adjustments, tools, options) and cannot be counted from source reliably; it prints the size by kind and every id without metadata, and with `--check` fails under 620 ids, on any missing metadata, or with no file (open the window once after a change).

## Colour that is real: 16-bit LittleCMS and DPX, DEV_PLAN 28.2 part 1 (app/services/lcms.py, dpx.py new; app/services/colour.py, imaging.py; app/routers/colour.py, io.py)

Decision: Pillow's `ImageCms` is 8-bit, so 16-bit and float conversion calls LittleCMS directly through `ctypes` (`services/lcms.py`) on the `liblcms2` Pillow's own wheel carries (`pillow.libs`, `PIL/.dylibs`), falling back to the system library. Nothing new is installed or linked; LittleCMS is MIT (NOTICE.md). Windows Pillow wheels link lcms statically, so there it needs a system `lcms2.dll`, else `LcmsError` names the problem. Conversion runs in `TYPE_*_DBL` (double) with `HIGHRESPRECALC`, then one rounding to 16 bits (`quantise`, optional triangular dither); `colour.convert_deep` and `POST /api/color/convert-deep` take the document's float32 channels (alpha last) and return float32 channels plus `X-Space`. CMYK to CMYK uses LittleCMS's black-only preserving intents (10 to 12) when `preserve_black`. Gray profiles LittleCMS makes itself (`builtin:gray-g22`, `g18`, `srgb`) are listed with the others; `builtin:lab` and `builtin:srgb` are internal. `POST /api/color/profile-info` gives a CMYK profile's total ink (`cmsDetectTAC`), black at the darkest RGB and the black generation implied by the black at 50 percent grey.

Removed: the refusal in `colour.lut()`, `raise ColourError("Documents and displays are RGB here; a CMYK profile can be proofed, not converted to yet.")`. A CMYK source or destination now gives a table (`_table`: GRID4^4 or GRID^3 with 8-bit values; `X-In` and `X-Out` headers say which); a gray source gives a ramp table (`_gray_table`); proofing still starts from RGB. `tests/test_colour.py::test_rgb_documents_only_for_now` asserted the removed refusal and became `test_a_cmyk_source_converts_to_a_four_dimensional_table`. README's Python line count moved to 11,000.

DPX (`services/dpx.py`, SMPTE 268M v2.0): read 8, 10, 12, 16 bits, both byte orders, filled Method A and B and the packed 10 and 12 bit stream, RGB, RGBA, ABGR, luma, end-of-line padding from the header; write 8, 10 (Method A), 12, 16, RGB (RGBA at 8 and 16). Transfer 1 (printing density) and 3 (log) go through the Cineon curve (white 685, black 95, 0.002 density a code, gamma 0.6) to linear, clipped at white, then sRGB encoded for the 16-bit document; 2 is linear and is sRGB encoded; video transfers pass through. Writing takes the transfer chosen. Wired in `io.py` (`decode-deep` for `.dpx`, `encode-dpx`, the export name filter) and `imaging.py` (`decode` as 8-bit PNG, `encode` as 10-bit log).

Verified: 16-bit RGB gradients and 204,800 random pixels to FOGRA39 CMYK and back against LittleCMS's own unoptimised 16-bit transform: maximum difference 0 and 1 code of 65535; a 10-bit log DPX ramp round trips within 111 of 65535 codes (0.43 of an 8-bit level); engine tests fail only as before (seven, models and the EXR codec).

## Agent bridge and Agent Connect, DEV_PLAN 28.4 (app/services/agents.py; app/routers/agents.py, mcp.py; app/main.py; setup/mcp_stdio.py, agents.py)

`services/agents.py` holds the master switch, each client's policy (allow, ask, deny; default ask, saved in `agents.json` in the data folder), sessions from MCP `initialize` clientInfo (`Mcp-Session-Id` returned and kept by `setup/mcp_stdio.py`; without a session, `_meta` clientInfo, then the User-Agent), the steps waiting for approval (120 second timeout, answered with what the agent should do next) and the activity log (200 entries). `routers/agents.py`: `/api/agents` state, `enabled`, `policy`, `approve`, `stop`, `activity` and a WebSocket `stream`. In `mcp.py`, `_agent_call` wraps every tool call; under Ask a call is risky when it writes a file (`save_project`, `export_image`, `timeline_render`) or when `describe_command` says the catalogue command is `risky`. New tools `list_commands`, `describe_command`, `run_command`, `run_commands`, `get_selection`, `get_layer_tree` (56 in all); every description ends in a "Use when" line from `USE_WHEN`; `/mcp?tools=core` (or `FORMVIS_MCP_TOOLS=core` for the stdio launcher, set in `.cursor/mcp.json`) lists the 31 most used for clients that cap tools. `GET /mcp` answers 405 and `DELETE /mcp` ends a session.

Verified: a live engine driven over `/mcp` and `/api/agents` (a risky step pending, approved, stopped, denied); the panel in headless Chromium.

## Terminals, Claude Code, the native renderer, the scrollbar check and the agent kit, DEV_PLAN 28.5, 28.6, 28.7 and 28.8 · _v1.67.4 (app/services/terminal.py, claude_code.py, native.py; app/routers/terminal.py, claude_code.py, native.py; app/main.py; native/formvis-render; setup/line_counts.py; .claude/skills)

`services/terminal.py`: PTY sessions (`ptyprocess`; `pywinpty` on Windows) with scrollback, resize, restart and close, started in the repo root with it first on PATH; `routers/terminal.py` under `/api/terminal`, output on a WebSocket as text frames and control messages as binary frames. Every terminal and Claude route and socket passes `origin_ok`: the Host header must be a loopback name (so a page that rebinds its domain to 127.0.0.1 is refused) and the Origin, when sent, must be a configured CORS origin or a loopback or Tauri one, because WebSockets are not covered by CORS. `services/claude_code.py`: finds `claude` (`FORMVIS_CLAUDE_BIN`, `which`, the install paths Format checks), reports installed, version and signed-in (`claude auth status`), spawns it in stream-JSON with `.mcp.json`'s formvis server and the chosen permission mode, streams its messages, answers Ask-mode permissions, and mirrors each bash call into a read-only terminal session; `routers/claude_code.py` under `/api/claude`. `native/formvis-render` 0.8.0, Format's crate's shape: dependencies pinned with `=`, winit behind a `window` feature, `Gpu::describe`, `native_start` and `enabled` on `FORMVIS_NATIVE`, `src/bench.rs` (the benchmark loop, moved from `bin/brush_bench.rs`, which now calls it), `bin/formvis-render.rs` (`info`, `composite --spec --out`, `bench`); `services/native.py` and `GET /api/native/status`; `NOTICE.md` lists the crate's 144 dependencies with their licences. `setup/line_counts.py` `scrollbar_problems`: `counts --check` fails on a scrollbar-width other than none, a scrollbar-color, a `::-webkit-scrollbar` rule that sizes or shows the bar, or `index.html` without the shared sheet. `.claude/skills`: `formvis-harness` (12 sub-skills), `formvis-driving` (12 sub-skills), `formvis-colour-science`, each with `EVALS.json`; `formvis-editing` is now a pointer to `formvis-driving` (its `references/tools.md` unchanged, still generated); `formvis-skillset` stays while `AGENTS.md`, `README.md` and `docs/AGENT_EVALS.md` name it; `./formvis agents sync` mirrors only `formvis-editing` so far.

Verified: engine tests fail only as on the unchanged tree (seven, models and the EXR codec); `test_agents_setup` 3 of 3; `agents sync --check` in step; `cargo build --release`, `cargo clippy --all-targets -D warnings` and `cargo test` clean, `cargo check` in `src-tauri` clean; `formvis-render info` JSON on llvmpipe, a two-layer multiply and screen composite matching hand values; `origin_ok` refuses a foreign Host and a foreign Origin. Removed lines taken after the version edit. Removed:

```text
__version__ = "1.67.3"
version = "1.67.3"
version = "1.67.3"
 "version": "1.67.3",
from app.services import sessions
version = "0.1.0"
wgpu = "30"
pollster = "1"
bytemuck = { version = "1", features = ["derive"] }
sysinfo = { version = "0.39", default-features = false, features = ["system"] }
[dev-dependencies]
# Only for examples/window.rs, which checks the display in a real window; the desktop shell brings its own window.
winit = "0.30"
            let mut placed: Option<([f32; 2], [f32; 2], Affine, [f32; 2])> = None;
```

From `native/formvis-render/src/bin/brush_bench.rs`, moved into `src/bench.rs`:

```rust
use formvis_render::composite::{Blender, Stack};
use formvis_render::{budget, Gpu, TiledLayer, TILE};
use std::collections::BTreeSet;
use std::time::Instant;
const STEP: f32 = 12.0; // pointer movement per update, in pixels
const RADIUS: f32 = 30.0;
const SPACING: f32 = 0.25 * 2.0 * RADIUS; // dabs every quarter of the diameter
    // A full background: every tile of the document holds pixels.
    let mut background = TiledLayer::new(SIZE, SIZE);
    let row: Vec<u8> = (0..SIZE).flat_map(|x| [(x % 256) as u8, 128, 200, 255]).collect();
    for band in (0..SIZE).step_by(TILE as usize) {
        let h = TILE.min(SIZE - band);
        let rows: Vec<u8> = (0..h).flat_map(|_| row.iter().copied()).collect();
        background.write(&gpu, 0, band, SIZE, h, &rows);
    }
    let mut paint = TiledLayer::new(SIZE, SIZE);
    let blender = Blender::new(&gpu);
    let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
    let mut times = Vec::with_capacity(UPDATES);
    let (mut last, mut carry) = ([200.0f32, 200.0f32], 0.0f32);
    for i in 1..=UPDATES {
        let t = Instant::now();
        let p = [200.0 + i as f32 * STEP, 200.0 + i as f32 * STEP * 0.6];
        let (dx, dy) = (p[0] - last[0], p[1] - last[1]);
        let len = (dx * dx + dy * dy).sqrt();
        let mut dirty = BTreeSet::new();
        let mut d = SPACING - carry;
        while d <= len {
            let c = [last[0] + dx * d / len, last[1] + dy * d / len];
            paint.dab(&gpu, c, RADIUS, 0.8, [0.9, 0.2, 0.1, 1.0], 0.7);
            for ty in ((c[1] - RADIUS).max(0.0) as u32 / TILE)..=((c[1] + RADIUS) as u32 / TILE) {
                for tx in ((c[0] - RADIUS).max(0.0) as u32 / TILE)..=((c[0] + RADIUS) as u32 / TILE) {
                    dirty.insert((tx, ty));
                }
            }
            d += SPACING;
        }
        carry = len - (d - SPACING);
        last = p;
        let layers = [Stack::new(&background, 0, 1.0), Stack::new(&paint, 0, 1.0)];
        let rendered: Vec<_> = dirty.iter().map(|&(tx, ty)| blender.render_tile(&gpu, &layers, tx, ty)).collect();
        let _ = gpu.device.poll(wgpu::PollType::wait_indefinitely());
        drop(rendered);
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let q = |f: f64| times[((times.len() - 1) as f64 * f).round() as usize];
    println!("{UPDATES} pointer updates on a {SIZE} px document: median {:.2} ms, 95th percentile {:.2} ms, worst {:.2} ms", q(0.5), q(0.95), q(1.0));
```

`.claude/skills/formvis-editing/SKILL.md` (and its identical `.agents/skills` mirror) lost its body to the pointer; the former text, as it stood at 1.67.3, is in the tag `v1.67.3` at that path (`git show v1.67.3:.claude/skills/formvis-editing/SKILL.md`), and `CLAUDE.md` lost its two routing lines naming `formvis-skillset` and `formvis-editing`, replaced by the lines naming the new skills.

## Settings, sessions, decoding, background removal and the io and ops routes rewritten from behaviour specs, DEV_PLAN 28.0 batch 26b · _v1.67.3 (app/core/config.py, app/services/sessions.py, imaging.py, background.py; app/routers/io.py, ops.py)

Batch 26 was first specced with line-by-line notes and came back mostly identical, so it was not placed. `cleanroom/batch-26b-engine-service-core-gapfill.md` states interfaces exactly (names, routes, status codes, headers, environment variables, messages) and the rest as behaviour, for a new implementer. None of the gaps written from behaviour came back identical; constants, imports, route decorators and the capabilities keys match, as they must. `sessions.py` as one whole-file write, the rest as single-region edits. Behaviour changes: an export name sent with a Windows path keeps only the file name (in the CHANGELOG); the light background engine's inset rounds down rather than to nearest (at most a pixel of the working copy), and GrabCut now receives RGB rather than BGR, which its colour models treat alike. Removed code: the earlier lines are not quoted, by the Phase 13 rule.

Verified: the engine tests fail only where the unchanged tree fails (seven: the LaMa, upscale and SAM models are absent here, and this OpenCV has no EXR codec). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.2"
version = "1.67.2"
version = "1.67.2"
 "version": "1.67.2",
```

## Version only · _v1.67.2

No engine code changed in 1.67.2 (DEV_PLAN 28.0 batches 22 and 23 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.67.1"
version = "1.67.1"
version = "1.67.1"
 "version": "1.67.1",
```

## Version only · _v1.67.1

No engine code changed in 1.67.1 (DEV_PLAN 28.0 batches 20 and 21 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.9"
version = "1.66.9"
version = "1.66.9"
 "version": "1.66.9",
```

## Version only · _v1.66.9

No engine code changed in 1.66.9 (DEV_PLAN 28.0 batches 18 and 19 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.8"
version = "1.66.8"
version = "1.66.8"
 "version": "1.66.8",
```

## Version only · _v1.66.8

No engine code changed in 1.66.8 (DEV_PLAN 28.0 batches 15 to 17 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.7"
version = "1.66.7"
version = "1.66.7"
 "version": "1.66.7",
```

## Version only · _v1.66.7

No engine code changed in 1.66.7 (DEV_PLAN 28.0 batches 12 to 14 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.6"
version = "1.66.6"
version = "1.66.6"
 "version": "1.66.6",
```

## Version only · _v1.66.6

No engine code changed in 1.66.6 (DEV_PLAN 28.0 batches 9 to 11 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.5"
version = "1.66.5"
version = "1.66.5"
 "version": "1.66.5",
```

## Version only · _v1.66.5

No engine code changed in 1.66.5 (DEV_PLAN 28.0 batches 6 to 8 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.4"
version = "1.66.4"
version = "1.66.4"
 "version": "1.66.4",
```

## Version only · _v1.66.4

No engine code changed in 1.66.4 (DEV_PLAN 28.0 batches 3 to 5 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.3"
version = "1.66.3"
version = "1.66.3"
 "version": "1.66.3",
```

## Version only · _v1.66.3

No engine code changed in 1.66.3 (DEV_PLAN 28.0 batches 1 and 2 are in the window). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.66.2"
version = "1.66.2"
version = "1.66.2"
 "version": "1.66.2",
```

## Version only · _v1.66.2

No engine code changed in 1.66.2 (DEV_PLAN 28.A, `./build_app`). The engine froze with PyInstaller and passed its `--selfcheck` inside `./build_app`'s run, and the frozen engine answered from the built `.deb`. The first full build let cargo rewrite `src-tauri/Cargo.lock` in its own order (the `formvis` and `formvis-render` entries moved, their dependency lists sorted, nothing added or changed in version), so those entries count as removed and re-added. Removed lines taken after the version edit; the desktop shell's lines are quoted here too. Removed:

```text
__version__ = "1.66.1"
[[package]]
name = "formvis"
version = "1.66.1"
dependencies = [
 "fontdb",
 "regex",
 "serde",
 "serde_json",
 "formvis-render",
 "tauri",
 "tauri-build",
 "tauri-plugin-dialog",
 "tauri-plugin-shell",
 "tauri-plugin-updater",
]
[[package]]
name = "formvis-render"
version = "0.1.0"
dependencies = [
 "bytemuck",
 "pollster",
 "sysinfo",
 "wgpu",
]
version = "1.66.1"
 "version": "1.66.1",
```

## Version only · _v1.66.0

No engine code changed in 1.66.0 (DEV_PLAN 27.7's first part, fill layers, is in the window; a project's `fillContent` passes `project_format.validate`, which checks asset names and links, not a layer's other fields). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.9"
version = "1.65.9"
version = "1.65.9"
 "version": "1.65.9",
```

## Version only · _v1.65.9

No engine code changed in 1.65.9 (DEV_PLAN 27.6's last part, Edit > Search and the Keyboard Shortcuts list, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.8"
version = "1.65.8"
version = "1.65.8"
 "version": "1.65.8",
```

## Version only · _v1.65.8

No engine code changed in 1.65.8 (DEV_PLAN 27.6's fourth part, File > Close All, Close Others, Save a Copy, Revert and Automate > Fit Image, is in the window; Save a Copy and Revert use the library's existing save and open). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.7"
version = "1.65.7"
version = "1.65.7"
 "version": "1.65.7",
```

## Version only · _v1.65.7

No engine code changed in 1.65.7 (DEV_PLAN 27.6's third part, Toggle Last State, Paste Special and Edit > Stroke, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.6"
version = "1.65.6"
version = "1.65.6"
 "version": "1.65.6",
```

## Version only · _v1.65.6

No engine code changed in 1.65.6 (DEV_PLAN 27.6's second part, Edit > Transform's Again, Scale, Rotate, Skew, Distort, Perspective and the layer's quarter turns, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.5"
version = "1.65.5"
version = "1.65.5"
 "version": "1.65.5",
```

## Version only · _v1.65.5

No engine code changed in 1.65.5 (DEV_PLAN 27.6's first part, the Image menu's Auto Tone, Auto Contrast and Auto Color, Desaturate, Equalize and Replace Color, Arbitrary rotation, Crop and Duplicate, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.4"
version = "1.65.4"
version = "1.65.4"
 "version": "1.65.4",
```

## Version only · _v1.65.4

No engine code changed in 1.65.4 (DEV_PLAN 27.5's last part, Combine Shapes and the artboard and frame commands, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.3"
version = "1.65.3"
version = "1.65.3"
 "version": "1.65.3",
```

## Version only · _v1.65.3

No engine code changed in 1.65.3 (DEV_PLAN 27.5's sixth part, Lock Layers and linked layers, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.2"
version = "1.65.2"
version = "1.65.2"
 "version": "1.65.2",
```

## Version only · _v1.65.2

No engine code changed in 1.65.2 (DEV_PLAN 27.5's fifth part, Layer Style, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before, once the README's line counts were brought up to date (its check had found TypeScript at 47,983 lines against the README's 46,400). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.1"
version = "1.65.1"
version = "1.65.1"
 "version": "1.65.1",
```

## Agents under MCP 2026-07-28, a busy window, place_image from a path · _v1.65.1 (app/routers/mcp.py; the formvis-editing skill's generated reference)

From the bug bounty of 6 and 7 October 2026, run while rehearsing an agent's edit over MCP against 1.63.0; its patches 0001 to 0003, each read as a description and made again by hand on this code (the file had changed only in apply_filter since). Caching hints: MCP 2026-07-28's caching utility (server/utilities/caching, read at the source) says servers MUST put `ttlMs` (an integer of 0 or more) and `cacheScope` (`public` or `private`) on complete results of server/discover, tools/list and prompts/list (and the resource lists, not served here). `_ok` added `resultType` alone, and Claude Code 2.1.292 refused tools/list ("Invalid result for tools/list": ttlMs undefined, cacheScope not one of its options), so it loaded none of formvis's tools. `_ok(req_id, result, modern, cacheable)` now adds `CACHE_HINTS` (ttlMs 300000, cacheScope public) to those three under 2026-07-28: the lists are the same for every caller and change only with a new formvis version, the case the spec gives for public, and five minutes is its own example. 2025-11-25 replies are unchanged. A busy window: the window does not poll while it works through a call and only polls refreshed `_seen`, so a call past `LIVE` (30 s) made the next one wait 20 s and fail with "formvis is not open", and one past 300 s made the next fail at once. `_taken` holds the calls the window has taken and not answered (set by `bridge_next` as it hands one over, dropped by `bridge_result` and by `_ask` either way); `_live` counts one taken within the last 600 s, as long as `_ask` waits for any call, as a sign of life; an answer refreshes `_seen` as a poll does. place_image: it took base64 alone, so an agent could put a file from disk into a document only by writing its base64 into its own call. It now takes `path`, an absolute path to a .png, .jpg, .jpeg or .webp read here as open_file reads (`_path`'s checks, `_MAX_OPEN`), the layer named after the file's stem (cut to 120) unless named, the call going on to the window with the picture as `data`; data still works, and a call with neither is told to give one. Its description says the picture keeps its size and transform_layer scales it, and a read error says "read". `./formvis agents sync` regenerated the skill's tool reference and its .agents mirror (the place_image section: the description, path added, data no longer required). The window's side of the bounty (remove_background) and the docs' tool count are in the frontend log.

Verified against the running engine, restarted after each change. tools/list, prompts/list and server/discover under 2026-07-28 each carry resultType, ttlMs 300000 and cacheScope public, tools/list 50 tools; under 2025-11-25 the two lists carry none; ping carries resultType alone. Through the window with agents allowed: Motion Blur at 120 px on a 5000 by 3000 document took 126 s, and a get_document sent 40 s into it waited and answered the moment the filter finished (the code before would have waited 20 s for a poll and then failed it, as the bounty saw; not run again here). place_image placed a PNG, a JPEG with a space in its name and a WebP by path (named astronaut, trails photo, and Named as asked), and base64 as before, one Place step each; no path, a relative path, a .txt and a missing file were each refused with what to do. tests/test_mcp.py and tests/test_agents_setup.py 12 passed after each change; the MCP agents, agent consent and Select Subject browser suites passed. The whole engine suite: 112 passed, 3 failing for this machine as before. The skill's generated reference lost, in each copy, place_image's old description and its required data line, replaced as above. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.65.0"
    _tool("place_image", "Places a PNG or JPEG image (base64) as a new layer at x, y.", {"data": {"type": "string", "description": "Base64 image data."}, "name": {"type": "string", "maxLength": 120},
          "x": {"type": "number", "default": 0}, "y": {"type": "number", "default": 0}}, ["data"]),
def _ok(req_id, result: dict, modern: bool) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": {**result, **({"resultType": "complete"} if modern else {})}}
    return time.monotonic() - _seen <= LIVE
        return _fail(f"Could not {'read' if name == 'open_file' else 'write'} the file: {exc.strerror or exc}.")
        out = _ok(req_id, {"supportedVersions": VERSIONS, "capabilities": {"tools": {}, "prompts": {}}, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": INSTRUCTIONS}, True)
        out = _ok(req_id, {"prompts": PROMPTS}, modern)
        out = _ok(req_id, {"tools": TOOLS}, modern)
version = "1.65.0"
version = "1.65.0"
 "version": "1.65.0",
```

## Version only · _v1.65.0

No engine code changed in 1.65.0 (DEV_PLAN 27.5's third part, the Select menu's commands, is in the window). Verified: the engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.9"
version = "1.64.9"
version = "1.64.9"
 "version": "1.64.9",
```

## The objects in a picture, for Mask All Objects · _v1.64.9 (app/services/background.py, app/routers/ops.py)

DEV_PLAN 27.5, second part. `background.objects(data, limit=24)`, served at `POST /api/ops/objects` (`find_objects`; 501 without ONNX Runtime, 422 for an unreadable or oversized picture, as Remove Background answers): U^2-Net's saliency at a working scale (the picture reduced so its longer side is at most 1024, before the model's own 320), its regions above half the threshold separated by OpenCV's `connectedComponentsWithStats` (8-connected), those of at least 0.05 percent of the picture (16 pixels at least) kept, largest first, at most 24. Every soft value at 8 or more goes to the object nearest it, by `distanceTransformWithLabels` with a label per pixel mapped back to its region (the labels number the regions' pixels in scan order, as `cc[fg == 1]` lists them, checked on a small grid), so touching soft edges are shared out rather than counted twice. Each object is a grey PNG cropped to its box, base64 in the JSON with the working size; the window scales them to the document. OpenCV, not SciPy: SciPy is used elsewhere in the engine but is no declared requirement. Verified: on a 1200 by 800 picture with three shapes on grey, three objects in 1.7 seconds, loading the model included, their boxes where the shapes are at the working scale; through the window, three masked folders matching the shapes. The engine's tests, 112 passed and 3 failing for this machine as before. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.8"
version = "1.64.8"
version = "1.64.8"
 "version": "1.64.8",
```

## Version only · _v1.64.8

No engine code changed in 1.64.8 (DEV_PLAN 27.5's first part, the Layer and Select operations, is in the window). Agents reach the same results through the tools they have (move_layer, merge_layers, set_layer, delete_layer). Verified: the engine's tests, 112 passed and 3 failing for this machine as before (no EXR codec, LaMa not downloaded, SAM's device reported as onnx). Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.7"
version = "1.64.7"
version = "1.64.7"
 "version": "1.64.7",
```

## apply_filter's Filter Gallery takes all 47 effects · _v1.64.7 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4 closed. `apply_filter`'s description lists the Filter Gallery's Sketch effects (basRelief, chalkCharcoal, charcoal, chrome, conteCrayon, graphicPen, halftonePattern with its three patterns, notePaper, photocopy, plaster, reticulation, stamp, tornEdges, waterPaper) and its Texture effects (craquelure, grain with its ten types, mosaicTiles, patchwork, stainedGlass, texturizer), each with its settings and their ranges, and says the Sketch effects' ink and paper are the foreground and background colours; the kind enum is unchanged. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied stacks of the new effects by key, by name and with `params`. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.6"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}, accentedEdges {edgeWidth 1 to 14, edgeBrightness 0 to 50, smoothness 1 to 15}, angledStrokes {directionBalance 0 to 100, strokeLength 3 to 50, sharpness 0 to 10}, crosshatch {strokeLength 3 to 50, sharpness 0 to 20, strength 1 to 3}, darkStrokes {balance 0 to 10, blackIntensity 0 to 10, whiteIntensity 0 to 10}, inkOutlines {strokeLength 1 to 50, darkIntensity 0 to 50, lightIntensity 0 to 50}, spatter {sprayRadius 0 to 25, smoothness 1 to 15}, sprayedStrokes {strokeLength 0 to 20, sprayRadius 0 to 25, strokeDirection: rightDiagonal|horizontal|leftDiagonal|vertical}, sumiE {strokeWidth 3 to 15, strokePressure 0 to 15, contrast 0 to 40}, diffuseGlow {graininess 0 to 10, glowAmount 0 to 20, clearAmount 0 to 20}, glass {distortion 0 to 20, smoothness 1 to 15, texture: frosted|blocks|canvas|tinyLens, scaling 50 to 200, invert}, oceanRipple {rippleSize 1 to 15, rippleMagnitude 0 to 20}, glowingEdges {edgeWidth 1 to 14, edgeBrightness 0 to 20, smoothness 1 to 15}; colours come from the foreground and background colours. Unnamed settings keep their defaults.",
version = "1.64.6"
version = "1.64.6"
 "version": "1.64.6",
```

## apply_filter's Filter Gallery takes twelve more effects · _v1.64.6 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, third part. `apply_filter`'s description lists the Filter Gallery's Brush Strokes effects (accentedEdges, angledStrokes, crosshatch, darkStrokes, inkOutlines, spatter, sprayedStrokes with its four stroke directions, sumiE), its Distort effects (diffuseGlow, glass with its four textures, oceanRipple) and Stylize's glowingEdges, each with its settings and their ranges; the kind enum is unchanged. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied stacks of the new effects by key, by name and with `params`. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.5"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Filter Gallery: filterGallery {effects: [{filter, values, visible}]}, its effect layers applied in order, the first at the bottom, hidden ones skipped; filter is one of: coloredPencil {pencilWidth 1 to 24, strokePressure 0 to 15, paperBrightness 0 to 50}, cutout {numberOfLevels 2 to 8, edgeSimplicity 0 to 10, edgeFidelity 1 to 3}, dryBrush and fresco {brushSize 0 to 10, brushDetail 0 to 10, texture 1 to 3}, filmGrain {grain 0 to 20, highlightArea 0 to 20, intensity 0 to 10}, neonGlow {glowSize -24 to 24, glowBrightness 0 to 50, glowColor (#rrggbb)}, paintDaubs {brushSize 1 to 50, sharpness 0 to 40, brushType: simple|lightRough|darkRough|wideSharp|wideBlurry|sparkle}, paletteKnife {strokeSize 1 to 50, strokeDetail 1 to 3, softness 0 to 10}, plasticWrap {highlightStrength 0 to 20, detail 1 to 15, smoothness 1 to 15}, posterEdges {edgeThickness 0 to 10, edgeIntensity 0 to 10, posterization 0 to 6}, roughPastels {strokeLength 0 to 40, strokeDetail 1 to 20, texture: canvas|brick|burlap|sandstone, scaling 50 to 200, relief 0 to 50, light: top|topRight|right|bottomRight|bottom|bottomLeft|left|topLeft, invert}, smudgeStick {strokeLength 0 to 10, highlightArea 0 to 20, intensity 0 to 10}, sponge {brushSize 0 to 10, definition 0 to 25, smoothness 1 to 15}, underpainting {brushSize 0 to 40, textureCoverage 0 to 40, and roughPastels' texture, scaling, relief, light, invert}, watercolor {brushDetail 1 to 14, shadowIntensity 0 to 10, texture 1 to 3}; colours come from the foreground and background colours. Unnamed settings keep their defaults.",
version = "1.64.5"
version = "1.64.5"
 "version": "1.64.5",
```

## apply_filter takes the Filter Gallery · _v1.64.5 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, second part. `apply_filter`'s `kind` enum gains filterGallery (67 kinds), and its description the stack's shape: `effects`, a list of effect layers `{filter, values, visible}` applied in order with the first at the bottom and hidden ones skipped; the fifteen Artistic effects by key, each with its settings and their ranges; colours from the foreground and background colours. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, apply_filter applied a stack by key, by name and with `params`, refused a hidden stack, an unknown name and an empty list with the window's reasons and changed nothing, and tools/list carries the kind. Removed lines taken after the version edit; the desktop shell's version lines are quoted here too. Removed:

```text
__version__ = "1.64.4"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Blur Gallery: spinBlur {blurAngle (degrees), x, y (percent of the selection's bounds, else the canvas), radiusX, radiusY (percent of their shorter side), angle}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree", "spinBlur"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.4"
version = "1.64.4"
 "version": "1.64.4",
```

## apply_filter takes Spin Blur · _v1.64.4 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.4, first part. `apply_filter`'s `kind` enum gains spinBlur (66 kinds), and its description its settings under "Blur Gallery": blurAngle in degrees, x and y in percent of the selection's bounds (else the canvas), radiusX and radiusY in percent of their shorter side, and angle. Fade and Last Filter are window commands with no agent tool of their own: an agent repeats a filter by calling apply_filter again. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, spinBlur with blurAngle 60 and radiusX 40 applied one step ("Applied spinBlur to Rectangle."). Removed lines taken after the version edit:

```text
__version__ = "1.64.3"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Drawn over the layer (a new empty layer keeps them apart), each with a seed for its arrangement: flame {path (a path's name; else the selected path; with none, an arc low in the selection or canvas), flameType: oneFlameAlongPath|multipleFlamesAlongPath|multipleFlamesPathDirections|multipleFlamesVariousLength|candleLight|multipleFlamesOneDirection, length, randomizeLength, width, angle, interval (px), adjustIntervalForLoops, quality: draft|low|medium|high|fine, customColor, color (#rrggbb), turbulent, jag, opacity, flameLines, flameBottomAlignment, flameStyle: normal|violent|flat, flameShape: parallel|toCenter|spread|oval|pointed, randomizeShapes, seed}; pictureFrame {frame: vineWithFlowers|vine|leafGarland|flowerBorder|berries|ribbon|waves|zigzag|dots|rope|scallops|lines|stars|hearts|snowflakes|bamboo, margin (percent), size, arrangement, lines, thickness, fade, vineColor, flowerColor, leafColor (#rrggbb), seed}; tree {baseTreeType: oak|maple|autumnMaple|birch|elm|apple|cherryBlossom|olive|willow|pine|fir|spruce|cypress|poplar|palm|coconutPalm|bamboo|shrub|bareWinterTree, lightDirection (1 to 5), leavesAmount, leavesSize, branchesHeight, branchesThickness, defaultLeaves, leavesColor, customBranchColor, branchesColor (#rrggbb), flatShading, x, y, size (percent of the selection's bounds, else the canvas), seed}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects", "flame", "pictureFrame", "tree"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.3"
version = "1.64.3"
 "version": "1.64.3",
```

## apply_filter takes Flame, Picture Frame and Tree · _v1.64.3 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.3 closed. `apply_filter`'s `kind` enum gains flame, pictureFrame and tree (65 kinds), and its description their settings as the window's library names them: Flame's `path` is a path's name (else the selected path; with none, an arc low in the selection or canvas), its six flame types, quality, style and shape by name; Picture Frame's sixteen frames by name and its three colours as `#rrggbb`; Tree's 19 base types by name, its colours, and its position and height in percent of the selection's bounds (else the canvas). It says the three draw over the layer and that a new empty layer keeps them apart, and that each takes a seed for its arrangement. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); tools/list after a restart gives 65 kinds; through the window, on a layer just added by add_layer (empty, given pixels as Render filters now are), tree (cherryBlossom), pictureFrame (stars, a blue vine), flame along a path named "Wick" and flame as candleLight each applied one step; flame with the path "Nowhere" answered 'Flame: this document has no path named "Nowhere".' and changed nothing; an unknown tree type was held to Oak, as unknown choices are. Removed lines taken after the version edit:

```text
__version__ = "1.64.2"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Stylize: findEdges and solarize with no settings; diffuse {mode: normal|darkenOnly|lightenOnly|anisotropic}, emboss {angle, height, amount}, extrude {type: blocks|pyramids, size, depth, depthMode: random|levelBased, solidFront, maskIncomplete}, oilPaint {stylization, cleanliness, brush (its scale), bristle, lighting, angle, shine}, tiles {count, maxOffset, fill: background|foreground|inverse|unaltered}, traceContour {level, edge: lower|upper}, wind {method: wind|blast|stagger, direction: fromRight|fromLeft}. Render: clouds and differenceClouds with no settings, and fibers {variance, strength, seed}, between the foreground and background colours; lensFlare {brightness, centerX, centerY (percent of the selection's bounds, else the canvas), lens: zoom|prime35|prime105|moviePrime}; lightingEffects {type: spot|point|infinite, color (#rrggbb), intensity, x, y, targetX, targetY (percent of the selection's bounds, else the canvas), z (percent of their shorter side), cone, hotspot, radius, angle, elevation, gloss, metallic, exposure, ambience, texture: none|luminance|red|green|blue|alpha, height, whiteIsHigh}. Unnamed settings keep their defaults.",
                                               "clouds", "differenceClouds", "fibers", "lensFlare", "lightingEffects"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.2"
version = "1.64.2"
 "version": "1.64.2",
```

## apply_filter takes Stylize and Render · _v1.64.2 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.3, first part. `apply_filter`'s `kind` enum gains the nine Stylize and five Render filters (62 kinds), and its description their settings, named as the window's library names them: findEdges, solarize, clouds and differenceClouds with no settings; diffuse, emboss, extrude, oilPaint, tiles, traceContour and wind with theirs; fibers, lensFlare and lightingEffects with theirs. It says that Clouds, Difference Clouds and Fibers lie between the foreground and background colours, and that Lens Flare's centre and Lighting Effects' light and target are in percent of the selection's bounds (else the canvas), the light's height in percent of their shorter side. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); tools/list after a restart gives the new description and 62 kinds; through the window, all 14 applied one step each by name ("Applied clouds to Rectangle." and so on), and Diffuse in each of its four modes. Removed lines taken after the version edit:

```text
__version__ = "1.64.1"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Distort, centred on the selection's bounds (else the canvas): twirl {angle}, pinch {amount}, spherize {amount, mode: normal|horizontalOnly|verticalOnly}, ripple {amount, size: small|medium|large}, polarCoordinates {mode: rectangularToPolar|polarToRectangular}, wave {generators, wavelengthMin, wavelengthMax, amplitudeMin, amplitudeMax, scaleX, scaleY (percent), type: sine|triangle|square, undefinedAreas: wrap|repeat, seed}, zigZag {amount, ridges, style: pondRipples|outFromCenter|aroundCenter}, shear {top, middle, bottom (percent of half the width), undefinedAreas: wrap|repeat}, displace {horizontal, vertical (percent), fit: stretch|tile, undefinedAreas: repeat|wrap, map (the name of an open document, required)}. Pixelate: facet and fragment with no settings; colorHalftone {maxRadius, channel1 to channel4 (degrees)}, crystallize {cellSize}, mezzotint {type: fineDots|mediumDots|grainyDots|coarseDots|shortLines|mediumLines|longLines|shortStrokes|mediumStrokes|longStrokes}, mosaic {cellSize}, pointillize {cellSize} (dots on the background colour). Unnamed settings keep their defaults.",
                                               "colorHalftone", "crystallize", "facet", "fragment", "mezzotint", "mosaic", "pointillize"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.1"
version = "1.64.1"
 "version": "1.64.1",
```

## apply_filter takes Distort and Pixelate · _v1.64.1 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.2. `apply_filter`'s `kind` enum gains the nine Distort and seven Pixelate filters, and its description their settings, named as the window's library names them; it says distortions centre on the selection's bounds (else the canvas), that Displace's `map` is the name of an open document and is required, and that Pointillize's dots sit on the background colour. `./formvis agents sync` regenerated the skill's reference and its mirror. Verified: the engine's tests that run here passed, test_mcp and test_agents_setup among them (112 passed, 3 failing for this machine, none touching agents); through the window, Twirl, Mosaic, Facet, Pointillize, Wave and Displace (its map named "Ripples") applied one step each, and Displace without a map answered "Displace needs its map: choose an open document.". Removed lines taken after the version edit:

```text
__version__ = "1.64.0"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur; with no settings: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle, ntscColors; boxBlur {radius}, shapeBlur {radius, shape: circle|ring|square|diamond|triangle|hexagon|star|heart|cross}, smartBlur {radius, threshold, quality: high|medium|low, mode: normal|edgeOnly|overlayEdge}, dustAndScratches {radius, threshold}, median {radius}, reduceNoise {strength 0 to 10, preserve, color, sharpen (percent), jpeg}, custom {kernel (25 integers, row by row), scale, offset}, hsbHsl {input, output: rgb|hsb|hsl}, highPass {radius}, maximum and minimum {radius, preserve: squareness|roundness}, offset {horizontal, vertical, undefinedAreas: transparent|repeat|wrap}, deInterlace {eliminate: oddFields|evenFields, createBy: interpolation|duplication}. Unnamed settings keep their defaults.",
                                               "custom", "hsbHsl", "highPass", "maximum", "minimum", "offset", "deInterlace", "ntscColors"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.64.0"
version = "1.64.0"
 "version": "1.64.0",
```

## apply_filter takes the filter library's 21 filters · _v1.64.0 (app/routers/mcp.py; the formvis-editing skill's tools.md and its .agents mirror regenerated)

DEV_PLAN 27.1. The agents' `apply_filter` tool lists the stage's 21 filters in its `kind` enum and their settings in its description: average (the selection filled with its average colour), blur, blurMore, sharpen, sharpenMore, sharpenEdges, despeckle and ntscColors with no settings; boxBlur, shapeBlur, smartBlur, dustAndScratches, median, reduceNoise, custom, hsbHsl, highPass, maximum, minimum, offset and deInterlace with theirs, named as the window's filter library names them (the window holds every value to its range and ignores names it does not know). `./formvis agents sync` regenerated the skill's tool reference and its `.agents` mirror, which test_agents_setup checks. Verified: the engine's tests that can run here passed, test_mcp and test_agents_setup among them (111 passed; 4 failing for this machine, none touching agents: no EXR codec in its OpenCV, the LaMa and SAM ONNX models not downloaded, the SAM device read as onnx); through the window, apply_filter with boxBlur and with average applied one step each ("Applied boxBlur to A.", "Applied average to A."). Removed lines taken after the version edit:

```text
__version__ = "1.63.0"
    _tool("apply_filter", "Applies a filter to the active layer (inside the selection if there is one). kind and its settings: gaussianBlur {radius}, motionBlur {angle, distance}, addNoise {amount, gaussian, monochromatic}, unsharpMask {usmAmount, usmRadius, threshold}, lensBlur {lensRadius}, surfaceBlur, radialBlur, tiltShift, irisBlur, fieldBlur. Unnamed settings keep their defaults.",
          {"kind": {"type": "string", "enum": ["gaussianBlur", "motionBlur", "addNoise", "unsharpMask", "lensBlur", "smartSharpen", "surfaceBlur", "radialBlur", "tiltShift", "irisBlur", "fieldBlur"]}, "settings": {"type": "object", "default": {}}}, ["kind"]),
version = "1.63.0"
version = "1.63.0"
 "version": "1.63.0",
```

## The undo store's batch drop; the bench's giant-document check · _v1.63.0 (app/routers/undo.py; setup/bench.py)

`POST /api/undo/drop` forgets many keys in one request (up to 100,000; keys not in the store's form skipped, the unlinking off the event loop). Found by DEV_PLAN 26.6h's 600 MP run: closing a document whose undo held a blur over the whole giant layer dropped about 34,000 keys one request each, and a browser runs six requests at a time to one server, so reopening the saved project waited behind them for many minutes (the engine opened it in 0.15 s, and the window, called directly, reopened it in 120 s). Checked through the engine's test client: three keys dropped, a malformed and a repeated one skipped, the others untouched, a body that is not `{"keys": [...]}` refused with 400. `./formvis bench` now also reports whether the window's own display draws a giant document (120 MP, kept in tiles) on the GPU, beside an ordinary one, in its results file and JSON (`giant_on_gpu`), for the check 1.62.9 could not make in a GPU-less browser. Removed lines taken after the version edit:

```text
__version__ = "1.62.9"
  return { res, checks, text: B.benchText(res, webgpu || webgl || 'unknown'), webgl, webgpu, ua: navigator.userAgent };
              "matches_cpu": got["checks"]}
version = "1.62.9"
version = "1.62.9"
 "version": "1.62.9",
```

## Version only · _v1.62.9

No engine code changed in 1.62.9 (the GPU per tile is in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.8"
version = "1.62.8"
version = "1.62.8"
 "version": "1.62.8",
```

## The streaming PNG reader · _v1.62.8 (app/routers/bands.py)

`/api/bands/read`: POST with an opened project's session and file opens its PNG (resolved by `sessions.asset_path`, so only files of an opened project, by safe names) to be read a band of rows at a time, 8-bit RGB or RGBA, not interlaced; GET to the key returns the next rows as RGBA, the reader closing after the last. Rows are inflated as they are asked for and unfiltered one at a time (`_unfilter`: None and Up at numpy speed, Up being what the banded writer uses; Sub by cumulative sums; Average and Paeth a byte at a time, correct and slow, for a PNG from elsewhere), holding only the current row and what is inflated ahead; RGB is given opaque alpha. It is how a giant layer (past what a browser can decode) is opened. Checked through the engine's test client: the writer's random RGBA (varying alpha) read back in bands of 300, 500 and 37 rows exactly; a Pillow RGB PNG (adaptive filters) read back exactly with alpha 255; an unknown key and a file not in the session 404; and through the window, the 120 MP project reopened exactly. Nothing removed besides the version lines:

```text
__version__ = "1.62.7"
version = "1.62.7"
version = "1.62.7"
 "version": "1.62.7",
```

## Version only · _v1.62.7

No engine code changed in 1.62.7 (filters on giant layers, their undo through the 1.60.8 store, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.6"
version = "1.62.6"
version = "1.62.6"
 "version": "1.62.6",
```

## Version only · _v1.62.6

No engine code changed in 1.62.6 (giant documents exported through the 1.61.2 banded PNG writer, from the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.5"
version = "1.62.5"
version = "1.62.5"
 "version": "1.62.5",
```

## Version only · _v1.62.5

No engine code changed in 1.62.5 (painting on giant layers, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.4"
version = "1.62.4"
version = "1.62.4"
 "version": "1.62.4",
```

## Version only · _v1.62.4

No engine code changed in 1.62.4 (a giant document's tiles paged through the 1.60.8 undo store, from the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.3"
version = "1.62.3"
version = "1.62.3"
 "version": "1.62.3",
```

## Version only · _v1.62.3

No engine code changed in 1.62.3 (giant documents open, display and compose, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.2"
version = "1.62.2"
version = "1.62.2"
 "version": "1.62.2",
```

## Version only · _v1.62.2

No engine code changed in 1.62.2 (tiled layers' first stage, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.62.1"
version = "1.62.1"
version = "1.62.1"
 "version": "1.62.1",
```

## The macOS install's missing packages · _v1.62.1 (requirements_macos.txt; tests/test_requirements.py new; setup/verify_local.py)

The owner's `./formvis verify-local` stopped at `No module named 'httpx'`. A Mac installs from requirements_macos.txt (backend/oc_install, the unpinned macOS base) and every other system from requirements.txt; six packages added to the main list over time never reached the Mac's: httpx (local generation's downloads; the engine imports local generation as it starts, so on a Mac installed this way it could not start), keyring (API keys in the system password store), onnxruntime and onnx (the local models and the style presets, base since 1.53.4 and 1.55.1), psd-tools (Photoshop files) and tifffile (TIFF). The six are added, unpinned as the rest of that list; tests/test_requirements.py fails whenever requirements.txt or requirements_ml.txt names a package its macOS list lacks (it failed with the old list, naming all six); verify-local names a missing package in one line with what to run instead of a traceback. Checked: the new tests pass, and fail with the old list put back; in a Python with no packages, verify-local said "formvis's engine is missing the Python package 'fastapi': run ./formvis install" and exited 1; the stand-in run still completes. Removed lines taken after the version edit:

```text
__version__ = "1.61.9"
    from app.localgen import klein, krea2
version = "1.61.9"
version = "1.61.9"
 "version": "1.61.9",
```

## The CLI names its version; the owner's second bench recorded · _v1.61.9 (formvis; docs/BENCH.md)

The owner's `./formvis verify-local` said "unknown command": the copy's `formvis` was older than 1.61.8 (on a Mac, opening a zip extracts a second copy beside the first and overwrites nothing, so "unzip it over your folder" could not be done as written). The help's first line now names the version, read from frontend/src/version.ts as it runs ("formvis 1.61.9 · layered image editor"), so a copy that missed an update shows it at once, and an unknown command is followed by it. The owner's second bench (1.61.7) is recorded in docs/BENCH.md: on the Apple M5's Metal 3, WebGPU and WebGL2 each 100.00% of values within 4 levels of the CPU's picture, the largest difference 3, so both are correct on real hardware; Automatic's WebGPU never more than 0.9 ms from the fastest path across the two runs and 22 times faster than the CPU with adjustment layers; the first run's section points to it. Checked: help's first line shows the version, an unknown command shows it, the CLI parses. Removed lines taken after the version edit (docs/BENCH.md's with them):

```text
__version__ = "1.61.8"
formvis · layered image editor
version = "1.61.8"
version = "1.61.8"
 "version": "1.61.8",
Not yet measured on this computer: whether each GPU path draws exactly what the CPU draws (`./formvis bench` checks it
from 1.61.7, against the bar formvis's GPU adjustment tests use: 99% of values within 4 levels), and the Channels view
through the native renderer, which needs the desktop app (H3).
```

## ./formvis verify-local · _v1.61.8 (setup/verify_local.py, setup/verify_local and setup/verify_local.bat new; formvis, formvis.bat)

The register's M7 named `./formvis verify-local`, never built. Now, for Krea 2 (Apple silicon, or Windows and Linux) and FLUX.2 [klein] 4B (Apple silicon), through the app's own localgen modules: a model not for this computer is said so; a licence not yet accepted is shown (name, version, link, summary, use policy) and accepted only by the person's yes, recorded by the module's own `record_consent` (declined or unanswered: skipped, nothing recorded); a model not installed has the build for this memory chosen (`krea2.recommended()`, Klein's 8-bit from 16 GB; the 4-bit builds with --small), its size stated and the download made only on a yes, through the module's own `install`; then one 1,024 by 1,024 picture from a fixed prompt and seed, timed. Results to bench-results/local-<date>-<machine>.md and .json, the pictures beside them, the machine recorded as bench records it. --yes answers every question (only when passed); --stand-in runs the flow with no download and no model. The shell and Windows wrappers find formvis's Python as `bench` does; the CLI and formvis.bat dispatch it. Checked here: --stand-in wrote both files and two pictures, labelled a stand-in; a real run with no one to answer showed the Krea 2 licence in full, skipped it, recorded no consent and downloaded nothing, and said Klein is not for this computer. Nothing removed besides the version lines:

```text
__version__ = "1.61.7"
version = "1.61.7"
version = "1.61.7"
 "version": "1.61.7",
```

## bench writes each GPU path's check · _v1.61.7 (setup/bench.py)

After the timings, bench runs the window's `checkPaths` and writes, per GPU path, the share of values within 4 levels of the CPU's picture and the largest difference, with "matches" or "DIFFERS" by the 99% bar, into the terminal, the .md (a table) and the .json (`matches_cpu`). Removed lines taken after the version edit:

```text
__version__ = "1.61.6"
  return { res, text: B.benchText(res, webgpu || webgl || 'unknown'), webgl, webgpu, ua: navigator.userAgent };
              "user_agent": got["ua"], "frames": args.frames, "rows": got["res"]["rows"], "notes": got["res"]["notes"], "native": native}
version = "1.61.6"
version = "1.61.6"
 "version": "1.61.6",
```

## ./formvis bench in the background, and the window server found on macOS · _v1.61.6 (setup/bench.py)

The owner's first run on a MacBook Air said the window server had not started, and asked for no window at all. Cause: Vite (host false) listens on localhost, which on macOS is IPv6 (::1) only, and bench asked 127.0.0.1 alone, so a running server went unseen for 90 s. Now `up()` asks localhost, then 127.0.0.1, and returns the address that answers, which the page opens; a server bench starts is logged to bench-results/window-server.log and waited for up to 2 minutes, and if it never answers (or exits) bench quotes its last lines instead of guessing; a missing npm is said plainly. No window by default: Chrome runs in the background with its GPU switched on (`GPU_ARGS`: enable-gpu, ignore-gpu-blocklist, enable-unsafe-webgpu, and Metal through ANGLE on macOS); `--window` opens one. Whether the GPU drew is read back, never assumed: an adapter the browser names as software (SwiftShader, llvmpipe, Microsoft Basic Render) is recorded (`software` in the .json, the .md's browser line) and bench says those numbers do not show the GPU and to run `--window`. Checked here: the default run with the server stopped started it, ran in the background (WebGPU now included, software on this machine), wrote both files and named the software adapter with the advice; with port 5190 held by another program, bench quoted Vite's "Port 5190 is already in use"; with no npm on the path, the plain message. Removed lines taken after the version edit:

```text
__version__ = "1.61.5"
Options: --frames N (default 60), --no-native (skip the native renderer), --headless (no window: software graphics,
for checking the command itself, not for numbers worth sending).
URL = os.environ.get("FORMVIS_BENCH_URL", "http://127.0.0.1:5190/")
def up() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:
            return r.status == 200
    except OSError:
        return False
def open_browser(p, headless: bool):
    try:
        return p.chromium.launch(channel="chrome", headless=headless), "Google Chrome"
    except Exception:
        pass
    try:
        return p.chromium.launch(headless=headless), "Playwright's Chromium"
    except Exception:
        sys.exit("[formvis] no browser to run in: install Google Chrome, or run "
                 f"'{sys.executable} -m playwright install chromium'")
    ap.add_argument("--headless", action="store_true")
    started = None
    if not up():
        say("starting formvis's window server (stopped again when the benchmark ends)")
        started = subprocess.Popen(["npm", "run", "dev"], cwd=ROOT / "frontend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   start_new_session=True, shell=os.name == "nt")
        for _ in range(90):
            if up():
        else:
            sys.exit("[formvis] the window server did not start: run ./formvis install, then try again")
            browser, which = open_browser(p, args.headless)
            say(f"running in {which}{' (headless: software graphics, numbers not worth sending)' if args.headless else ''}; keep its window in front until it closes")
            page.goto(URL)
              "browser": f"{which} {browser_version}", "headless": args.headless, "webgl": got["webgl"], "webgpu": got["webgpu"],
| Browser | {record['browser']}{' (headless, software graphics)' if args.headless else ''} |
    say("send that .md file back; it holds the numbers and the machine they were measured on")
version = "1.61.5"
version = "1.61.5"
 "version": "1.61.5",
```

## ./formvis bench · _v1.61.5 (setup/bench.py, setup/bench and setup/bench.bat new; formvis, formvis.bat, .gitignore)

The register's H4 named `./formvis bench`, and it had never been built; the owner ran it on a MacBook Air and got "unknown command". Now: it starts the window server if it is not running (and stops it after), opens the installed Google Chrome in a visible window (a hidden browser draws on a software GPU) or else Playwright's Chromium, installs Playwright first if needed, runs Help > Performance Benchmark's tests (gpu/bench.ts) on every display path the browser has with 60 frames by default, asks the browser which adapter WebGL2 and WebGPU draw with, runs the native renderer's brush benchmark when Rust is installed (said plainly when not), and writes bench-results/<date>-<machine>.md and .json (the machine, the browser, both adapters, every timing, the notes) and says which file to send back; bench-results/ is ignored by git. Options: --frames N, --no-native, --headless (software graphics, for checking the command). The shell and Windows wrappers find formvis's Python as `test` does; formvis.bat dispatches it; the npm start and the server's stop work on Windows too. Checked here as the owner would run it, headless with the window server stopped first: it started the server, ran in Chrome on the software adapter (named in the file), wrote both files, and stopped the server again. Nothing removed besides the version lines:

```text
__version__ = "1.61.4"
version = "1.61.4"
version = "1.61.4"
 "version": "1.61.4",
```

## Version only · _v1.61.4

No engine code changed in 1.61.4 (room made before a large filter, in the window; the register's test drives the engine's MCP, library, undo store and banded PNG writer as they were). Removed lines taken after the version edit:

```text
__version__ = "1.61.3"
version = "1.61.3"
version = "1.61.3"
 "version": "1.61.3",
```

## Version only · _v1.61.3

No engine code changed in 1.61.3 (raster paging and automatic history memory, in the window; the paged layer's tiles use the 1.60.8 store). Removed lines taken after the version edit:

```text
__version__ = "1.61.2"
version = "1.61.2"
version = "1.61.2"
 "version": "1.61.2",
```

## The banded PNG writer · _v1.61.2 (app/routers/bands.py new; app/main.py)

`/api/bands/png`: POST with width, height and ppi opens a PNG (signature, IHDR as 8-bit RGBA, pHYs) in the data folder's bands directory and returns a key; POST to the key appends whole rows (RGBA, top first), each band given PNG's Up filter with numpy (the row before kept between bands) and deflated straight into IDAT chunks; POST to the key's end checks every row came, closes the stream (IEND) and returns the file. Part rows, extra rows and missing rows are refused; the directory is emptied when the engine starts (`bands.clear()` in main.py, beside the router's inclusion). Checked through the engine's test client (random RGBA with varying alpha in three bands decoded back exactly at its 300 ppi; a part row and missing rows refused) and through the window (the 150 MP export, the engine peaking 161 MB). Nothing removed besides the version lines:

```text
__version__ = "1.61.1"
version = "1.61.1"
version = "1.61.1"
 "version": "1.61.1",
```

## Version only · _v1.61.1

No engine code changed in 1.61.1 (whole-layer filters' room from measured peaks, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.9"
version = "1.60.9"
version = "1.60.9"
 "version": "1.60.9",
```

## Version only · _v1.60.9

No engine code changed in 1.60.9 (filters in bands, in the window; a banded filter's undo uses the 1.60.8 store). Removed lines taken after the version edit:

```text
__version__ = "1.60.8"
version = "1.60.8"
version = "1.60.8"
 "version": "1.60.8",
```

## The undo store · _v1.60.8 (app/routers/undo.py new; app/main.py)

`/api/undo`: POST keeps the bytes sent (a tile's pixels before and after) deflated with zlib at level 1 under a new 32-hex key and returns it; GET gives them back as sent; DELETE forgets them; keys other than 32 lower-case hex are refused. The folder (`undo` under the data folder) is emptied when the engine starts (`undo.clear()` in main.py, beside the router's inclusion), so nothing outlives its session. Checked through the engine's test client (a 1 MB put stored as 8 KB, given back byte for byte, dropped, then 404; a bad key 400) and through the window's paging in the browser (47 tiles put, all given back and dropped by undo, none left after closing). Nothing removed besides the version lines:

```text
__version__ = "1.60.7"
version = "1.60.7"
version = "1.60.7"
 "version": "1.60.7",
```

## Version only · _v1.60.7

No engine code changed in 1.60.7 (a stroke's undo as tiles, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.6"
version = "1.60.6"
version = "1.60.6"
 "version": "1.60.6",
```

## Version only · _v1.60.6

No engine code changed in 1.60.6 (strokes in a window on large layers, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.5"
version = "1.60.5"
version = "1.60.5"
 "version": "1.60.5",
```

## Version only · _v1.60.5

No engine code changed in 1.60.5 (the opening snapshot, the stroke pool and the count, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.4"
version = "1.60.4"
version = "1.60.4"
 "version": "1.60.4",
```

## Version only · _v1.60.4

No engine code changed in 1.60.4 (memory back on close, and the count as measured, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.3"
version = "1.60.3"
version = "1.60.3"
 "version": "1.60.3",
```

## Version only · _v1.60.3

No engine code changed in 1.60.3 (Markup, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.60.2"
version = "1.60.2"
version = "1.60.2"
 "version": "1.60.2",
```

## Version only · _v1.60.2

No engine code changed in 1.60.2: the window's memory budget uses the memory the engine already reports (`/api/capabilities`, since 1.53.4). Removed lines taken after the version edit:

```text
__version__ = "1.60.1"
version = "1.60.1"
version = "1.60.1"
 "version": "1.60.1",
```

## timeline_transition takes a colour · _v1.60.1 (app/routers/mcp.py)

`timeline_transition` gains `color` (transparent, black or white) for its fades, Photoshop's Fade With Black and Fade With White, and says so in its description; the formvis-editing skill's generated reference regenerated by `./formvis agents sync` (that description and field in its .claude and .agents copies). Checked as a real MCP client: a white fade-in made and read back. Removed lines taken after the version edit:

```text
__version__ = "1.59.9"
    _tool("timeline_transition", "Adds a transition to a layer's clip: fade_in, fade_out or fade (both) over seconds; cross_fade with the clip starting or ending within it (only the upper fades, so the picture never dips); or remove.",
          {"id": _ID, "kind": {"type": "string", "enum": ["fade_in", "fade_out", "fade", "cross_fade", "remove"]}, "seconds": {"type": "number", "minimum": 0.01, "maximum": 600, "default": 1}}, ["id", "kind"]),
version = "1.59.9"
version = "1.59.9"
 "version": "1.59.9",
```

## Version only · _v1.59.9

No engine code changed in 1.59.9 (the Move tool keying a keyed layer, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.8"
version = "1.59.8"
version = "1.59.8"
 "version": "1.59.8",
```

## Version only · _v1.59.8

No engine code changed in 1.59.8 (the timeline's empty state and single steps, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.7"
version = "1.59.7"
version = "1.59.7"
 "version": "1.59.7",
```

## The video timeline's MCP tools · _v1.59.7 (app/routers/mcp.py)

The catalogue gains eleven tools (39 to 50), named after Photon Studio's timeline operations, with their hints: `timeline_get` and `timeline_frame_image` read only and idempotent; `timeline_delete` and `timeline_render` destructive; `timeline_set`, `timeline_go_to` and `timeline_clip` idempotent. `_run` handles `timeline_render` as it handles export_image: the path checked (absolute, ending .mp4, .gif or .zip), the window asked for the file (`__render`, with the format from the suffix and from, to and scale as given), and the bytes written there. Checked as a real MCP client against the open window: the eleven listed, each run, and the three renders written (an MP4 of 20 frames, a 20-frame GIF, a 20-file zip). The formvis-editing skill's tool reference (generated from this catalogue, "do not edit by hand") was regenerated by `./formvis agents sync`, as at 1.56.1: 95 lines added in its .claude and .agents copies, none removed; the check in step. Nothing removed besides the version lines:

```text
__version__ = "1.59.6"
version = "1.59.6"
version = "1.59.6"
 "version": "1.59.6",
```

## Render Video's picture sequence · _v1.59.6 (app/routers/video.py)

`POST /api/video/sequence` (frames as PNGs in order, and a name): the frames as `name_00001.png` and on in one zip, stored rather than deflated again (PNG is compressed already), the name cleaned to letters, digits, spaces, hyphens and underscores. Checked through the window's Render Video: 30 frames zipped as T_00001.png to T_00030.png at 100 by 50. Removed lines taken after the version edit:

```text
__version__ = "1.59.5"
version = "1.59.5"
version = "1.59.5"
 "version": "1.59.5",
```

## Version only · _v1.59.5

No engine code changed in 1.59.5 (timeline edits as undo steps, in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.4"
version = "1.59.4"
version = "1.59.4"
 "version": "1.59.4",
```

## Version only · _v1.59.4

No engine code changed in 1.59.4 (the keyframe lanes in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.3"
version = "1.59.3"
version = "1.59.3"
 "version": "1.59.3",
```

## Version only · _v1.59.3

No engine code changed in 1.59.3 (the video timeline's panel in the window). Removed lines taken after the version edit:

```text
__version__ = "1.59.2"
version = "1.59.2"
version = "1.59.2"
 "version": "1.59.2",
```

## Version only · _v1.59.2

No engine code changed in 1.59.2 (the video timeline's model in the window; Video (MP4) uses the 1.58.9 encoder). Removed lines taken after the version edit:

```text
__version__ = "1.59.1"
version = "1.59.1"
version = "1.59.1"
 "version": "1.59.1",
```

## Version only · _v1.59.1

No engine code changed in 1.59.1 (the Layers panel's sizing in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.9"
version = "1.58.9"
version = "1.58.9"
 "version": "1.58.9",
```

## Video · _v1.58.9 (app/routers/video.py new, app/main.py)

The parity plan's L1. ffmpeg runs as a separate program, never bundled (its usual builds are LGPL or GPL): FORMVIS_FFMPEG, else ffmpeg on the PATH, else imageio-ffmpeg's binary when that package happens to be installed (it is not a dependency); without one, 503 says how to install it. POST /api/video/probe: size, frame rate and duration from ffmpeg's own report (no ffprobe needed). POST /api/video/frames: from `start` to `end` seconds, every `every`th frame (a select filter), scaled to fit `max_side` on even sizes, at most 300, as a 4-byte length, a JSON header (width, height, fps, every, delayMs, count, sizes) and PNGs. POST /api/video/encode: frames and their delays to H.264 (yuv420p, CRF 18, faststart): the frames are repeated on a common grid of time (the delays' greatest common divisor, up to 60 a second; else 30 a second with each delay rounded) and written as a constant-rate image sequence. Found on the way: ffmpeg's concat list either added a frame (the last listed twice, 11 frames and 1.04 seconds for 10 and 1.0) or drifted to its own time base (1.36 seconds for 1.4); the grid gives ten frames in 1.000 seconds, a 500 ms frame among 100 ms ones fourteen frames in 1.400 seconds, and delay 0 ten frames at 30 a second in 0.33 seconds. Checked here with a real clip: the probe's figures; a 1 to 2 second trim of ten frames identical to ffmpeg's own frames 10 to 19; every third frame (ten at 300 ms); an encode checked by ffprobe. (A still picture probes as a one-frame video, as ffmpeg reads it; the dialog offers video files.) Removed lines taken after the version edit:

```text
__version__ = "1.58.8"
version = "1.58.8"
version = "1.58.8"
 "version": "1.58.8",
```

## The library in any folder, conflict-safe saves · _v1.58.8 (app/core/config.py, app/routers/projects.py)

The parity plan's L13. `config.projects_dir` is FORMVIS_LIBRARY_DIR, else the folder kept in library.json in the data folder, else the data folder's Projects (`default_projects_dir`), falling back to it when a chosen folder cannot be made. GET /api/projects/folder answers where the library is, the default, whether the environment fixes it, and the synced folders found on this computer (iCloud Drive's Mobile Documents, Dropbox, OneDrive, Google Drive and macOS's CloudStorage providers, each with a Formvis folder suggested); PUT moves it (made if missing and tested by writing a temporary file; with `move`, each project copied with its times, checked by size and only then removed, a same-named project there kept and the one moved in renamed "(moved)"; an empty folder means the default). Saves stay atomic (a temporary file in the same folder, then renamed) and became conflict-safe: a save naming the version it was based on (`base`, the file's modification time in nanoseconds and size) overwrites only a file still at that version; otherwise it is written beside it as "name (conflict date time)" (the library's name rule allows it), the answer saying so and what was kept. Every save and every open answers with the file's version. Checked here over the API with a temporary data folder: a first save, an open at the same version, a save on it overwriting; another device's copy appended, then a save on the old version: the conflict copy written and the other version byte for byte; saving on to the copy without conflict; the library moved to a "synced" folder with three projects (a same-named one there kept, the incoming one "(moved)"), listed and opened from there, and back to the default with all four; a folder that cannot be written refused with the reason. Removed lines taken after the version edit:

```text
__version__ = "1.58.7"
    return _ensure(data_dir() / "Projects")
def save(name: str = Form(...), manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> dict:
    for x in OLD_EXTS:
        target.with_suffix(x).unlink(missing_ok=True)
    return {"name": target.stem, "path": str(target), "size": len(blob)}
    return sessions.payload(sessions.create(assets), manifest, assets, path.stem)
version = "1.58.7"
version = "1.58.7"
 "version": "1.58.7",
```

## Version only · _v1.58.7

No engine code changed in 1.58.7 (the compact layout in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.6"
version = "1.58.6"
version = "1.58.6"
 "version": "1.58.6",
```

## Version only · _v1.58.6

No engine code changed in 1.58.6 (touch gestures in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.5"
version = "1.58.5"
version = "1.58.5"
 "version": "1.58.5",
```

## Version only · _v1.58.5

No engine code changed in 1.58.5 (the dialogs' defaults). Removed lines taken after the version edit:

```text
__version__ = "1.58.4"
version = "1.58.4"
version = "1.58.4"
 "version": "1.58.4",
```

## More generation providers · _v1.58.4 (app/services/providers.py new, app/routers/generative.py)

The parity plan's L7. `providers.py`: OpenAI, Google, Black Forest Labs and Ideogram, each request its provider's documented one (checked against the providers' documentation this session for Black Forest Labs, polling included, and Ideogram's v3 multipart; OpenAI's images API and Gemini's generateContent as documented): OpenAI images/generations with a Bearer key (and images/edits with the mask's fill area made transparent, as OpenAI reads it), Google generateContent with x-goog-api-key, the IMAGE modality and the nearest aspect ratio, Black Forest Labs flux-pro-1.1 (and flux-pro-1.0-fill) with x-key, then its polling_url until Ready, Ideogram v3 generate with Api-Key as a multipart form. Keys from each provider's usual environment variable, else the password store through secrets.py (a private providers.json where there is none), never sent back; each base movable with FORMVIS_<PROVIDER>_BASE. Errors named: a missing key 428, a rejected key "rejected the API key", no credit 402, Google's and Ideogram's fill refused by name. Routes: GET /generative/providers, PUT and DELETE /generative/providers/{id}/key; /generative/generate and /fill take `provider` (fal by default). Checked here against stand-in servers (a harness in /tmp): no key 428, a wrong key named; a picture from each in its colour (OpenAI 1536 by 1024 for a wide document, Black Forest Labs 1440 by 800 within its limits on 32-pixel steps); fills from OpenAI and Black Forest Labs; the stand-ins' log shows each request's header, model, size or aspect, Black Forest Labs polled from Pending to Ready, Ideogram's multipart fields, and OpenAI's edit mask transparent over exactly the quarter that was white. Removed lines taken after the version edit:

```text
__version__ = "1.58.3"
from app.services import generative
async def fill(image: UploadFile = File(...), mask: UploadFile = File(...), prompt: str = Form("")) -> Response:
        png = await run_in_threadpool(generative.fill, image_bytes, mask_bytes, prompt)
async def generate(prompt: str = Form(""), width: int = Form(1024), height: int = Form(1024)) -> Response:
    """Generate Image (1.51.2): a picture from a prompt alone, as PNG."""
        png = await run_in_threadpool(generative.generate, prompt, width, height)
version = "1.58.3"
version = "1.58.3"
 "version": "1.58.3",
```

## Version only · _v1.58.3

No engine code changed in 1.58.3 (Vanishing Point works in the window). Removed lines taken after the version edit:

```text
__version__ = "1.58.2"
version = "1.58.2"
version = "1.58.2"
 "version": "1.58.2",
```

## Photomerge and Merge to HDR · _v1.58.2 (app/routers/merge.py new, app/main.py)

`POST /api/merge/panorama` (photos, layout auto or reposition, crop): OpenCV's Stitcher in panorama (spherical) or scans (move and turn) mode; transparent where no photo reaches, found as the pure black the stitcher leaves there joined to the edge; or cropped to the largest rectangle the photos fill (the histogram method on a reduced mask); the header X-Photos-Stitched says how many photos the stitch kept. `POST /api/merge/hdr` (exposures): aligned by median threshold bitmaps, the camera's response recovered and the exposures merged by Debevec, scaled so the exposure nearest the middle keeps its mid-tones; exposure times from EXIF, or when any photo lacks one estimated from the photos (the median ratio of pixels mid-toned in both, in linear light). Found on the way: OpenCV 5.0's bindings expose no warper and no result mask, so Perspective and Cylindrical are out of reach; recomposing white copies to find the covered area crashed (composePanorama segfaults when the stitch kept only some photos), so that path was dropped; three tiles cut from one flat picture are a degenerate test (no camera rotation, so the cameras cannot be worked out: one tile was dropped, and a lower confidence gave a tiny picture), so the test set became views from a virtual camera turning about its centre. Checked here: the three turned views stitch whole in 0.5 s (582 by 405, 0.988 covered; cropped 582 by 383, fully covered), looked at; the exposures (a scene up to four times white, shot at 0.25, 1 and 4) give estimated times 0.25, 1.0 and 3.994, the merge reaching 4.07 against the scene's 4, mid-tones at a median ratio of 1.000 and a log correlation of 0.998, the brightest parts averaging 1.59 against the scene's 1.75. Removed lines taken after the version edit:

```text
__version__ = "1.58.1"
version = "1.58.1"
version = "1.58.1"
 "version": "1.58.1",
```

## The Lab reader · _v1.58.1 (app/routers/io.py)

`POST /io/decode-lab` answers 204 for anything not Lab, else a 4-byte length, a JSON header (width, height, bits, layers) and each layer's L, a, b and alpha as 16-bit values in the window's encoding. Three libraries, three conventions, each found by test here: an 8-bit CIELab TIFF through Pillow, whose bytes are the file's own, so a* and b* are read signed as the TIFF specification has them (formvis's own 8-bit export round-trips exactly, -30 and -60 included; Pillow's own TIFF writer puts them offset, which this reads as the specification says); a 16-bit one through tifffile (a* and b* signed, times 256; tifffile cannot read LZW without imagecodecs, so 8-bit files stay with Pillow); a Lab PSD through psd-tools' numpy, which for Photoshop's layout (L, a, b over 0 to 255, a and b offset by 128) gives each over 0 to 1, the window's encoding as it is, and a layer's transparency from its shape channel. Two wrong turns on the way, both caught by the tests: a first version took Pillow's "A" band for transparency, but Pillow's Lab bands are L, A and B and its A is a*; a second read a* and b* as signed from psd-tools, which held only for psd-tools' own Lab writer, which puts them signed on disk where Photoshop's layout keeps them offset (test files were then written in Photoshop's layout, Lab bytes in RGB(A) channels numbered 0, 1, 2 and -1, the header marked Lab). Checked here: 8-bit and 16-bit TIFF, flat and layered PSD, an RGB TIFF refused with 204. Removed lines taken after the version edit:

```text
__version__ = "1.57.9"
version = "1.57.9"
version = "1.57.9"
 "version": "1.57.9",
```

## CMYK to CMYK, pure black kept · _v1.57.9 (app/routers/colour.py)

`POST /color/convert-ink` (form: width, height, source and dest as base64 ICC, intent, preserve_black, and the 8-bit inks): through LittleCMS by Pillow's ImageCms. Pillow reaches only the four standard intents, so LittleCMS's black-preserving ones (tried: intents 11 and 14 are refused) are done here: with `preserve_black` (the default) a pixel inked with black alone stays black alone, its black moved to the value of the same lightness under the new profile (both profiles' black ramps measured in Lab and matched). Checked here with FOGRA39L to itself: with it (0, 0, 0, 255) and (0, 0, 0, 128) come back unchanged; without it they become (195, 179, 161, 212) and (102, 80, 80, 25), four-colour black, as plain colorimetric conversion makes them (in Photoshop too); a blue (200, 100, 0, 0) converts the same either way. Removed lines taken after the version edit:

```text
__version__ = "1.57.8"
version = "1.57.8"
version = "1.57.8"
 "version": "1.57.8",
```

## 16-bit CMYK and Lab TIFF · _v1.57.8 (app/routers/io.py, requirements.txt; NOTICE.md)

`POST /io/encode-tiff16` (fields width, height, space; files values.raw and, for CMYK, profile.icc): 16-bit CMYK as separated inks with the profile in tag 34675, and 16-bit Lab as CIELab with L* over 0 to 65535 and a* and b* as signed 16-bit values (a* times 256), both zlib-compressed, through tifffile, since Pillow writes neither. tifffile pinned at 2026.3.3 (BSD-3-Clause, Christoph Gohlke) in requirements.txt and credited in NOTICE.md; it needs only numpy for zlib. Checked through the browser's exports: tifffile reads the CMYK file back as uint16 separated with the profile and the inks exact, and the Lab file as CIELab within 1/256 of the floats. Removed lines taken after the version edit:

```text
__version__ = "1.57.7"
version = "1.57.7"
version = "1.57.7"
 "version": "1.57.7",
```

## Version only · _v1.57.7

No engine code changed in 1.57.7 (32-bit adjustments compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.57.6"
version = "1.57.6"
version = "1.57.6"
 "version": "1.57.6",
```

## The sky model · _v1.57.6 (app/localgen/sky.py new, app/localgen/model_manager.py, app/main.py)

The gate first: xiongzhu666's sky segmenter (Sky-Segmentation-and-Post-processing on GitHub, MIT, Copyright 2021, licence read there; a U-2-Net its author trained, its README not saying on what data) through the Hugging Face copy the VGGT project uses (JianyuanWang/skyseg, tagged MIT, its card naming the origin), pinned to revision 3ba8c6df and SHA-256 ab9c34c6... from the real 175,997,079-byte download. `sky.py`: the picture at 320 by 320 with ImageNet's normalisation, the output stretched to 0 to 255 and scaled back to the picture as a soft mask; `POST /api/sky/mask`, 409 until the model is downloaded. Checked here on scikit-image's rocket: 1.1 s on the CPU, the top band 0.95 sky, the rocket's body 0.25 and the bottom 0.20 in the soft mask, looked at as an overlay (sky and the gaps in the towers' lattice tinted, the rocket, towers and hills not); over HTTP 1.9 s. Removed lines taken after the version edit:

```text
__version__ = "1.57.5"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router, _lg_face.router):
version = "1.57.5"
version = "1.57.5"
 "version": "1.57.5",
```

## Version only · _v1.57.5

No engine code changed in 1.57.5 (Grayscale and the mode chains are window code). Removed lines taken after the version edit:

```text
__version__ = "1.57.4"
version = "1.57.4"
version = "1.57.4"
 "version": "1.57.4",
```

## Remove's finder · _v1.57.4 (app/routers/remove_find.py new, app/main.py)

`POST /api/remove/find` (kind `people` or `distractions`): People turns each face YuNet finds into a box around the person (from 1.3 face widths left to 2.3 right, half a face above to 7.5 below) that SAM2 makes the person's mask; the largest person is kept as the subject when their face is at least 2.5 times the next one's, or, alone, fills at least 0.5% of the picture. Distractions adds U2-Net's salient objects other than the largest (and at least 0.05% of the picture) to the people other than the subject. The mask is dilated by a few pixels; 409 names a missing model. A first subject rule (at least 4% of the picture) marked a portrait-sized subject for removal; corrected before release. Checked here on the scene: the background person covered 0.71, the subject 0.00, everything else 0.000; 4.6 s for People on the CPU (22.5 s the first time, while SAM2 loaded); over HTTP the same mask in 4.8 s. Removed lines taken after the version edit:

```text
__version__ = "1.57.3"
version = "1.57.3"
version = "1.57.3"
 "version": "1.57.3",
```

## Convert to Profile at 32 bits: the linear matrix · _v1.57.3 (app/services/colour.py, app/routers/colour.py)

`colour.linear_matrix(source, dest)`: the 3 by 3 matrix taking linear RGB in one profile to linear RGB in another through each profile's D50 primaries (Pillow's `red_colorant`, `green_colorant`, `blue_colorant`), `np.linalg.solve(dest, source)`; a non-RGB profile and an RGB profile without primaries (table-based) are refused by name. `POST /color/linear-matrix` returns it. Checked here: sRGB to sRGB is the identity; sRGB to Adobe RGB (1998) takes white to (0.999991, 1.000003, 1.000013) and pure red to 0.7151, the known value; the shipped CMYK profile is refused. Removed lines taken after the version edit:

```text
__version__ = "1.57.2"
version = "1.57.2"
version = "1.57.2"
 "version": "1.57.2",
```

## Version only · _v1.57.2

No engine code changed in 1.57.2 (the float filters and gates are window code). Removed lines taken after the version edit:

```text
__version__ = "1.57.1"
version = "1.57.1"
version = "1.57.1"
 "version": "1.57.1",
```

## Version only · _v1.57.1

No engine code changed in 1.57.1 (32-bit composing is window code). Removed lines taken after the version edit:

```text
__version__ = "1.56.9"
version = "1.56.9"
version = "1.56.9"
 "version": "1.56.9",
```

## Version only · _v1.56.9

No engine code changed in 1.56.9 (styles compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.8"
version = "1.56.8"
version = "1.56.8"
 "version": "1.56.8",
```

## Version only · _v1.56.8

No engine code changed in 1.56.8 (the gates and derive are window code). Removed lines taken after the version edit:

```text
__version__ = "1.56.7"
version = "1.56.7"
version = "1.56.7"
 "version": "1.56.7",
```

## Faces for Face-Aware Liquify · _v1.56.7 (app/localgen/face.py new, app/localgen/model_manager.py, app/main.py)

`face.py`: YuNet through OpenCV's `FaceDetectorYN` (score 0.75, NMS 0.3), the picture capped at 2,048 px on its long side for detection and the results scaled back; each face's box and five landmarks named by the side of the picture they are on (`eyeLeft`, `eyeRight`, `nose`, `mouthLeft`, `mouthRight`), largest first; `POST /api/face/landmarks`, 409 until the model is downloaded. `model_manager.py`: the registry entry (MIT, OpenCV's Hugging Face revision 3cc26e7f) and the SHA-256 pin from the real download. `main.py` includes the router. Checked here: on scikit-image's astronaut portrait one face, score 0.93, box (178, 63, 90, 113), the eyes at (200, 102) and (247, 103), the nose at (220, 125), the mouth corners at (199, 143) and (240, 144), looked at on the picture; 0.2 s. Removed lines taken after the version edit:

```text
__version__ = "1.56.6"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router, _lg_style.router):
version = "1.56.6"
version = "1.56.6"
 "version": "1.56.6",
```

## Lab TIFF · _v1.56.6 (app/routers/io.py)

`POST /io/encode-lab-tiff`: the window's 8-bit Lab bytes (L * 255 / 100, a and b offset by 128) with a* and b* turned to signed bytes, as the TIFF specification's CIELab (photometric 8) and Photoshop have them, then written by Pillow with LZW. Pillow writes the bytes it is given; its own reading of a CIELab file adds 128 back, which is why the file reads through Pillow as L 17.3, a 22, b 0 for a pixel the window composed as (17.3, 22.2, 0.2). Removed lines taken after the version edit:

```text
__version__ = "1.56.5"
version = "1.56.5"
version = "1.56.5"
 "version": "1.56.5",
```

## Version only · _v1.56.5

No engine code changed in 1.56.5 (Liquify runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.4"
version = "1.56.4"
version = "1.56.4"
 "version": "1.56.4",
```

## Version only · _v1.56.4

No engine code changed in 1.56.4 (Lab is computed in the window; LittleCMS was used only to check the formulas). Removed lines taken after the version edit:

```text
__version__ = "1.56.3"
version = "1.56.3"
version = "1.56.3"
 "version": "1.56.3",
```

## Version only · _v1.56.3

No engine code changed in 1.56.3 (the Art History Brush paints in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.2"
version = "1.56.2"
version = "1.56.2"
 "version": "1.56.2",
```

## Version only · _v1.56.2

No engine code changed in 1.56.2 (the Mixer Brush paints in the window). Removed lines taken after the version edit:

```text
__version__ = "1.56.1"
version = "1.56.1"
version = "1.56.1"
 "version": "1.56.1",
```

## CMYK PSD through psd-tools · _v1.56.1 (app/routers/io.py, app/routers/mcp.py, requirements.txt)

`POST /io/decode-cmyk-psd`: psd-tools reads the file; 204 unless it is an 8-bit CMYK PSD; each pixel layer's ink read as stored (`topil(apply_icc=False)`: by default psd-tools converts through the embedded profile, which turned every layer of a profiled file into RGB and made the first version return no layers), its alpha from `numpy()`, a layer mask folded into the alpha, its name, place, size, opacity, visibility (`is_visible`, parents counted) and blend mode; the answer is a 4-byte length, a JSON header, the layers' bytes, the profile. `POST /io/encode-cmyk-psd`: the composite laid on paper as the PSD's merged image, each layer by `PixelLayer.frompil` with its transparency as a layer mask (`create_mask`; Photoshop's CMYK documents carry no transparency band), opacity, visibility and blend mode, the profile as the ICC image resource. `_PSD_BLENDS` maps formvis's 27 blend modes to psd-tools'. `get_document`'s description names the depth and profile. Checked here: a two-layer document written and read back with names, places, sizes, opacity, a hidden layer, Multiply and Normal, ink exactly, the transparent half at alpha 0 and the 121,368-byte profile byte for byte; a PNG answers 204. Removed lines taken after the version edit:

```text
__version__ = "1.55.9"
    _tool("get_document", "The open document: name, size, resolution, colour mode, the layers bottom to top (id, name, kind, visible, opacity, blend, parent group), the active layer and the selection's bounds.", {}, read=True, idempotent=True),
version = "1.55.9"
version = "1.55.9"
 "version": "1.55.9",
```

## Version only · _v1.55.9

No engine code changed in 1.55.9 (derive runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.8"
version = "1.55.8"
version = "1.55.8"
 "version": "1.55.8",
```

## Version only · _v1.55.8

No engine code changed in 1.55.8 (Adaptive Wide Angle runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.7"
version = "1.55.7"
version = "1.55.7"
 "version": "1.55.7",
```

## Version only · _v1.55.7

No engine code changed in 1.55.7 (colour-model operations compose in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.6"
version = "1.55.6"
version = "1.55.6"
 "version": "1.55.6",
```

## Version only · _v1.55.6

No engine code changed in 1.55.6 (Perspective Warp runs in the window). Removed lines taken after the version edit:

```text
__version__ = "1.55.5"
version = "1.55.5"
version = "1.55.5"
 "version": "1.55.5",
```

## Version only · _v1.55.5

No engine code changed in 1.55.5 (the float compositor is window code). Removed lines taken after the version edit:

```text
__version__ = "1.55.4"
version = "1.55.4"
version = "1.55.4"
 "version": "1.55.4",
```

## Seam carving · _v1.55.4 (app/routers/seam.py new, app/main.py)

`seam.py`: `_energy` (luminance gradient plus the protection mask times a million), `_seam` (the dynamic programme over rows, vectorised across the row's columns, with a back-pointer array), `_remove`, `_insert` (the seam duplicated with its left neighbour averaged), `carve_width` (removal one seam at a time with the mask carved along; enlargement by the k lowest seams of the original tracked back to original columns, sorted per row and inserted with offsets), `carve` (height through the transpose, the mask carved to the new width first), `skin_mask` (Cb 77 to 127, Cr 133 to 173); `POST /api/seam/content-aware-scale` with `file`, `width`, `height`, `skin`, and an optional `mask`; limits a quarter to twice the size and 12 megapixels. Registered in `main.py`. Checked here: 320 by 200 to 240 in 0.58 s, to 400 in 0.72 s, a protected disc kept whole. Removed lines taken after the version edit:

```text
__version__ = "1.55.3"
version = "1.55.3"
version = "1.55.3"
 "version": "1.55.3",
```

## Version only · _v1.55.3

No engine code changed in 1.55.3. Removed lines taken after the version edit:

```text
__version__ = "1.55.2"
version = "1.55.2"
version = "1.55.2"
 "version": "1.55.2",
```

## Version only · _v1.55.2

No engine code changed in 1.55.2 (the deblocker runs in the window; Super Zoom reuses the shipped upscaler). Removed lines taken after the version edit:

```text
__version__ = "1.55.1"
version = "1.55.1"
version = "1.55.1"
 "version": "1.55.1",
```

## Style Transfer presets · _v1.55.1 (app/localgen/style.py new, app/localgen/paths.py, app/localgen/model_manager.py, app/main.py, requirements.txt)

`style.py`: the ONNX model zoo's five fast neural style models (BSD-3-Clause), each pinned by SHA-256 from the real download; the zoo exports a fixed 224 by 224 input, so the graph's input and output dims are made dynamic in memory when the session is built (the onnx package, Apache-2.0, pinned in requirements at 1.23.1; the file on disk stays the pinned original); RGB floats 0 to 255 in and out, the picture capped at 1024 on its long side for the model and scaled back; `POST /api/style/local` with a `style` field. `paths.session()` also takes model bytes, so the patched graph gets the same providers and memory settings as every model. Checked here: each preset on a photograph at 640 px in 1.1 to 1.5 s at the picture's own size. Removed lines taken after the version edit:

```text
__version__ = "1.54.9"
    SAM 2.1 and U^2-Net held 2,575 MB after three runs each; off, 687 MB (a peak of 1,314 MB), for a little speed."""
    return ort.InferenceSession(str(path), options, providers=providers())
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router, _lg_colorize.router):
version = "1.54.9"
version = "1.54.9"
 "version": "1.54.9",
```

## Colour for a black-and-white picture · _v1.54.9 (app/localgen/colorize.py new, app/localgen/model_manager.py, app/main.py)

`colorize.py`: DDColor-tiny as ONNX on ONNX Runtime with DDColor's own recipe (the picture's L of Lab as an RGB made of L alone, 512 by 512 in 0 to 1 NCHW; the predicted a and b scaled back to the picture's size and joined to the picture's own L through OpenCV's float Lab, so luminance is never touched); `POST /api/colorize/local`, 409 until the model is downloaded. `model_manager.py`: the registry entry (Apache-2.0, edgetools' revision 4755ae9f) and the SHA-256 pin computed from the real download. `main.py` includes the router. Checked here: a grey pier photograph colourised plausibly with luminance within 0.9; ONNX Runtime prints constant-folding warnings for the fp16 weights, harmless. Removed lines taken after the version edit:

```text
__version__ = "1.54.8"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router, _lg_depth.router):
version = "1.54.8"
version = "1.54.8"
 "version": "1.54.8",
```

## Depth from one picture · _v1.54.8 (app/localgen/depth.py new, app/localgen/model_manager.py, app/main.py)

`depth.py`: Depth Anything V2 Small as ONNX on ONNX Runtime; the picture scaled to 518 by 518 and ImageNet-normalised (NCHW), the relative inverse depth scaled back to the picture's size and written as an 8-bit PNG with near bright; `POST /api/depth/local`, 409 until the model is downloaded. The session's real names are `pixel_values` and `predicted_depth`. `model_manager.py`: the registry entry (Apache-2.0, onnx-community's revision 413ce838) and the SHA-256 pin computed from the real download. `main.py` includes the router. Checked here: the model listed ready once in place; a synthetic scene's near object reads 203 and its far sky 85, in 1.8 s on this CPU. Removed lines taken after the version edit:

```text
__version__ = "1.54.7"
for _router in (_lg_jobs.router, _lg_models.router, _lg_krea2.router, _lg_klein.router, _lg_loras.router, _lg_checkpoints.router, _lg_generate.router, _lg_upscale.router, _lg_inpaint.router):
version = "1.54.7"
version = "1.54.7"
 "version": "1.54.7",
```

## Version only · _v1.54.7

No engine code changed in 1.54.7 (the first Neural Filters run in the window). Removed lines taken after the version edit:

```text
__version__ = "1.54.6"
version = "1.54.6"
version = "1.54.6"
 "version": "1.54.6",
```

## Version only · _v1.54.6

No engine code changed in 1.54.6. Removed lines taken after the version edit:

```text
__version__ = "1.54.5"
version = "1.54.5"
version = "1.54.5"
 "version": "1.54.5",
```

## Version only · _v1.54.5

No engine code changed in 1.54.5 (Blend If and Knockout are window compositing). Removed lines taken after the version edit:

```text
__version__ = "1.54.4"
version = "1.54.4"
version = "1.54.4"
 "version": "1.54.4",
```

## OpenEXR contained · _v1.54.4 (app/services/contained.py new, app/routers/io.py, app/__init__.py, formvis_engine.py)

The parity plan's L14, closed. The engine keeps OpenCV's OpenEXR codec off; `contained.py` decodes and encodes EXR in a spawned child interpreter that turns the codec on for itself (`decode_exr`, `encode_exr`, `is_exr` by the file's magic), polling the result queue so a child that dies answers at once and a 60 s ceiling for one that hangs; workers answer None on any failure rather than tracing into the engine's log. `/io/decode-deep` routes an EXR to the child and names the refusal; `/io/encode-deep` writes EXR through it. `formvis_engine.py` calls `multiprocessing.freeze_support()` for the frozen build. Checked: a malformed EXR fails in 0.17 s with the engine process's codec still off and the process up; this sandbox's OpenCV wheel cannot write EXR at all (OpenEXR: NO), so the round trip is the owner's to confirm. Removed lines taken after the version edit:

```text
"""formvis engine."""
import os
# 32-bit documents (1.53.9, the parity plan's H1): OpenEXR is off in OpenCV by default, because its parser has had
# security problems with untrusted files (opencv/opencv#21326). formvis opens the person's own files on their own
# machine, so it is turned on for the engine, before OpenCV is first imported.
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
__version__ = "1.54.3"
    data = np.frombuffer(file.file.read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        raise HTTPException(status_code=415, detail="The picture could not be read at its depth.")
        ok, out = cv2.imencode({"png": ".png", "tiff": ".tif", "exr": ".exr", "tiff32": ".tif"}[format], cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGBA2BGRA))
version = "1.54.3"
version = "1.54.3"
 "version": "1.54.3",
```

## Version only · _v1.54.3

No engine code changed in 1.54.3 (the one float pixel model is a window change). Removed lines taken after the version edit:

```text
__version__ = "1.54.2"
version = "1.54.2"
version = "1.54.2"
 "version": "1.54.2",
```

## The sRGB to ink table · _v1.54.2 (app/services/colour.py, app/routers/colour.py)

`rgb_cmyk_lut(profile, source, intent, bpc)`: a GRID^3 table of C, M, Y, K bytes (r slowest, b fastest) from an RGB profile (sRGB when none) to a CMYK one, the window's readouts and paint colours; `/color/rgb-cmyk-lut`. The exact path for pixels stays `convert_pixels`. Checked: 33^3 by 4 bytes; a red through the table lands within 1 level of the direct transform. Removed lines taken after the version edit:

```text
__version__ = "1.54.1"
version = "1.54.1"
version = "1.54.1"
 "version": "1.54.1",
```

## CMYK documents · _v1.54.1 (app/services/colour.py, app/routers/colour.py, app/routers/io.py, app/profiles/FOGRA39L_coated.icc new; setup/freeze_backend and .bat)

`colour.py`: `shipped_dir` (beside the app, or PyInstaller's `_MEIPASS`), `default_cmyk`, `cmyk_lut` (GRID4 = 17, c slowest, k fastest, relative intent), `convert_pixels` (LittleCMS at 8 bits, RGBA to CMYK and alpha or back, alpha through, MAX_BYTES times 8 a request); `profile_dirs` lists the shipped folder second; `profiles()` marks `shipped`. `routers/colour.py`: `/cmyk-lut`, `/convert-pixels` (multipart: pixels, width, height, to, profile base64, source base64, intent, bpc), `/default-cmyk`. `routers/io.py`: `/decode-cmyk` (Pillow; ink and alpha bytes then the embedded profile, `X-Profile-Bytes`; 204 when not CMYK) and `/encode-cmyk` (alpha lays the ink over paper, TIFF deflate or JPEG, profile embedded). The freeze scripts bundle `profiles`. The profile is colord's FOGRA39L under the zlib licence (NOTICE.md); ECI's own is not shippable. Checked: the conversion equals `ImageCms.applyTransform` directly; the table is 17^4 by 3 bytes; a TIFF ink round trip is exact and JPEG within 1 level. Removed lines taken after the version edit:

```text
__version__ = "1.53.9"
from fastapi import APIRouter, File, HTTPException, UploadFile
    dirs = [config.data_dir() / "Profiles"]
            out.append({"id": digest, **info, "file": path.name, "added": d == profile_dirs()[0]})
pyinstaller --noconfirm --clean --onefile --name formvis-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --collect-submodules app --collect-submodules uvicorn --collect-submodules keyring --hidden-import cv2 --exclude-module pillow_heif "%ROOT%\backend\formvis_engine.py" || exit /b 1
version = "1.53.9"
version = "1.53.9"
 "version": "1.53.9",
```

## Click-to-select with SAM 2.1 · _v1.42.0 (app/services/segment.py new, app/routers/ops.py, app/routers/system.py, app/services/compute.py, requirements_sam2.txt new; tests/test_select_object.py new)

`segment.py`: `available`, `torch_device`, `ensure_checkpoint` (SHA-256 checked), `encode`, `select`, `clear`, `model_dir` (FORMVIS_MODELS_DIR). `ops.py`: `select_object`. `system.py`: `_select_object` in capabilities. `compute.set_preference` also clears the SAM model. Removed:

```python
from app.services import background
from app.services import background, compute, imaging
        from app.services import background
```

## .comp import · _v1.40.0 (app/services/project_format.py, app/routers/projects.py; tests/test_comp_import.py new)

`project_format.py`: `COMP_LABEL`, `COMP_VERSIONS`, `is_comp` (a .comp recognised by its shape, then fully validated); the refusal messages name .comp. `projects.py`: `.comp` in `SUFFIXES`. Removed:

```python
SUFFIXES = (".fmv", ".formvis", ".canvasor", ".zip")
    if fmt not in SUPPORTED:
        raise ProjectError("This is not a formvis or canvasor project.")
    if not isinstance(version, int) or version not in SUPPORTED[fmt]:
        raise ProjectError(f"This project uses format version {version}, which this build cannot read.")
        raise ProjectError("The file is not a formvis or canvasor package.") from exc
```

## Camera RAW decoding · _v1.39.0 (app/services/imaging.py, requirements.txt, requirements_macos.txt; tests/test_raw.py and tests/fixtures/ new)

`imaging.py`: `RAW`, `RAW_ENGINE`, `RAW_SUFFIXES`, `_raw` (LibRaw through rawpy, before Pillow), and `decoders` reporting `raw` and `rawEngine`. Removed:

```python
    return {"heic": HEIF or sips_available(), "tiff": True, "engine": engine}
```

## The engine's compute device · _v1.26.0 (app/services/compute.py new; app/services/background.py, app/routers/system.py; tests/test_compute.py new)

`compute.py`: `DEVICES`, `PROVIDER`, `LABEL`, `available_providers`, `choose` (pure), `current`, `set_preference`. `background.py`: `_session(model, providers)` with the older-rembg fallback, `clear_sessions`, the providers from `compute.current()`. `system.py`: `GET` and `POST /api/compute` (`ComputeChoice`), `compute` in `/api/capabilities`. Removed:

```python
from fastapi import APIRouter
from app.services import background, imaging
def _session(model: str):
    return new_session(model)
    mask = remove(image.convert("RGB"), session=_session(model_name()), only_mask=True)
```

## The reference app's project format removed · _v1.4.0 (app/services/project_format.py, app/routers/projects.py, app/__init__.py)

`project_format.py` no longer accepts `com.reference.project`: `SUPPORTED` holds `com.nodemode.formvis` and `com.nodemode.canvasor` version 1; the refusals and `write_zip`'s docstring name only formvis's and canvasor's projects. `projects.py` drops `.ref` from `SUFFIXES`. Version 1.4.0. Removed:

```py
__version__ = "1.3.0"
SUFFIXES = (".fmv", ".formvis", ".ref", ".canvasor", ".zip")
REFERENCE = "com.reference.project"
# NodeMode canvasor's projects: the same manifest and images/ layout as .ref (bottom-to-top layers, each transform an
# origin and a displayed size), under their own id. Version 1 is the one seen; later versions are rejected, not guessed.
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2), CANVASOR: range(1, 2)}
        raise ProjectError("This is not a formvis, .ref or canvasor project.")
        raise ProjectError("The file is not a formvis, .ref or canvasor package.") from exc
    """The project as a zip: manifest.json and images/. With `root`, everything sits inside that one folder, so
    unzipping a .ref export yields a `Name.ref` package."""
```

## canvasor projects open · _v0.97.0 (app/services/project_format.py, app/routers/projects.py; tests/test_api.py)

`project_format.py`: `CANVASOR = "com.nodemode.canvasor"`, accepted at version 1 in `SUPPORTED` (later versions refused); the refusals name canvasor. `projects.py`: `SUFFIXES` strips `.canvasor` from project names. Removed:

```py
SUFFIXES = (".fmv", ".formvis", ".ref", ".zip")
SUPPORTED = {REFERENCE: range(1, 8), FORMVIS: range(1, 2)}
        raise ProjectError("This is not a formvis or .ref project.")
        raise ProjectError("The file is not a formvis or .ref package.") from exc
```

## Colour profiles in the encoder · _v0.92.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py)

`imaging.encode` takes `icc`: checked by LittleCMS (`ImageCms`), at most 1 MB, embedded in TIFF, WebP and AVIF, not in PDF. `/encode` takes an optional `icc` file. One test added. Removed:

```python
def encode(file: UploadFile = File(...), format: str = Form(...), quality: int = Form(90), dpi: int = Form(72)) -> Response:
        data = imaging.encode(file.file.read(), format.lower(), quality, dpi)
from PIL import Image, ImageOps
def encode(png: bytes, fmt: str, quality: int = 90, dpi: int = 72) -> bytes:
    images carry no alpha here), WebP or AVIF (at `quality`, alpha kept)."""
        rgba.save(out, "TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        rgba.save(out, "WEBP", quality=q, method=4)
        rgba.save(out, "AVIF", quality=q)
```

## .fmv projects · _v0.90.0 (app/routers/projects.py, app/routers/io.py, tests/test_api.py)

`projects.py`: `EXT` (.fmv) and `OLD_EXT` (.formvis); `_library_path` names `.fmv`; `_existing` finds either for opening; the library lists both, `.fmv` preferred; save removes an older `.formvis` of the same name; delete removes either; `SUFFIXES` strips `.fmv` from imported names. `io.py`: the export rule takes `.fmv`. One test added. Removed:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis|webp|tif|tiff|pdf|avif)$", re.IGNORECASE)
SUFFIXES = (".formvis", ".ref", ".zip")
    return config.projects_dir() / f"{clean}.formvis"
    items = []
    for path in config.projects_dir().glob("*.formvis"):
        stat = path.stat()
        items.append({"name": path.stem, "modified": stat.st_mtime, "size": stat.st_size})
    return sorted(items, key=lambda item: item["modified"], reverse=True)
    path = _library_path(name)
    _library_path(name).unlink(missing_ok=True)
```

## Export encodings · _v0.75.0 (app/services/imaging.py, app/routers/io.py, tests/test_api.py, logged together)

`imaging.encode` re-encodes the editor's PNG as TIFF (LZW, alpha kept), PDF (one page at the given dpi, flattened on white), WebP or AVIF (quality, alpha kept), refusing other formats and unreadable input with `DecodeError`; `ENCODINGS` maps each to its media type. `POST /api/io/encode` serves it (415 on refusal). `EXPORT_NAME` accepts .webp, .tif, .tiff, .pdf and .avif. Two tests added. Removed from `app/routers/io.py`:

```python
EXPORT_NAME = re.compile(r"^[^/\\:*?\"<>|\x00-\x1f]{1,160}\.(png|jpg|jpeg|formvis)$", re.IGNORECASE)
```

## tests/

### tests/__init__.py, conftest.py, test_api.py · new · _v0.67.0

The backend suite, run by `python -m pytest -q tests` from `backend/`. `conftest.py` points `FORMVIS_DATA_DIR` at a fresh temporary folder per test and yields a FastAPI `TestClient`, plus `png_bytes` and `manifest` helpers; `test_api.py` covers health, version, capabilities, decode, export naming, the project library and its validation, packaging and the background engine's 501 answer, 9 tests. Nothing was removed.

## app/routers/generative.py

### app/routers/generative.py · new · _v0.37.0

`GET /status`, `PUT /key`, `DELETE /key`, `POST /fill` (the call runs in a thread so it never blocks the server). Nothing was removed.

### app/routers/generative.py · /upscale · _v0.38.0

`POST /upscale` (image, scale 2 or 4). Nothing was removed.

## app/services/generative.py

### app/services/generative.py · new · _v0.37.0

fal client for FLUX.1 Fill [pro] and Erase [pro]: key from FAL_KEY, FAL_API_KEY or `generative.json` (mode 600) in the data folder, never returned; inline PNG data URIs; fal's errors mapped to clear messages; `FORMVIS_FAL_BASE` points it elsewhere for testing. Nothing was removed.

### app/services/generative.py · upscale, _result_png · _v0.38.0

Real-ESRGAN upscaling; result parsing shared by Fill, Erase and Upscale. Removed:

```py
    images = result.get("images") or ([result["image"]] if isinstance(result.get("image"), dict) else [])
    if not images or not isinstance(images[0], dict) or not images[0].get("url"):
        raise GenerativeError("fal returned no image.", 502)
    if any(result.get("has_nsfw_concepts") or []):
        raise GenerativeError("fal withheld the result under its safety filter. Try another prompt.", 422)
    raw = _download(str(images[0]["url"]))
    try:
        with Image.open(io.BytesIO(raw)) as im:
            out = io.BytesIO()
            im.convert("RGBA").save(out, "PNG")
            return out.getvalue()
    except Exception as exc:  # noqa: BLE001 - any decode failure is a bad result
        raise GenerativeError("fal returned an image formvis could not read.", 502) from exc
```

## Org-navi-map

```text
.env.example  · template for backend/.env
HASHOUT_LOG.md  · this log
app/
    __init__.py  · version string
    core/
        __init__.py  · package marker
        config.py  · ports, limits, folders, .env loading
    main.py  · app assembly, CORS, static mount
    routers/
        __init__.py  · package marker
        io.py  · decode and export
        ops.py  · remove background
        projects.py  · library, import, sessions
        system.py  · health, version, capabilities
    services/
        __init__.py  · package marker
        background.py  · rembg and GrabCut
        imaging.py  · Pillow and pillow-heif decoding, sips fallback
        project_format.py  · manifest validation, zip and folder IO
        sessions.py  · opened-project sessions
boot_backend  · start the engine (unix)
boot_backend.bat  · start the engine (windows)
formvis_engine.py  · PyInstaller sidecar entry
oc_install  · install this side (unix)
oc_install.bat  · install this side (windows)
requirements.txt  · pinned base
requirements_desktop.txt  · pinned PyInstaller
requirements_desktop_macos.txt  · unpinned PyInstaller
requirements_macos.txt  · unpinned base for macOS
requirements_ml.txt  · pinned ML extra
requirements_ml_macos.txt  · unpinned ML extra
```

## Table of contents

- [.env.example](#envexample)
- [app/__init__.py](#app__init__py)
- [app/core/__init__.py](#appcore__init__py)
- [app/core/config.py](#appcoreconfigpy)
- [app/main.py](#appmainpy)
- [app/routers/__init__.py](#approuters__init__py)
- [app/routers/io.py](#approutersiopy)
- [app/routers/ops.py](#approutersopspy)
- [app/routers/projects.py](#approutersprojectspy)
- [app/routers/system.py](#approuterssystempy)
- [app/services/__init__.py](#appservices__init__py)
- [app/services/background.py](#appservicesbackgroundpy)
- [app/services/imaging.py](#appservicesimagingpy)
- [app/services/project_format.py](#appservicesproject_formatpy)
- [app/services/sessions.py](#appservicessessionspy)
- [boot_backend](#boot_backend)
- [boot_backend.bat](#boot_backendbat)
- [formvis_engine.py](#formvis_enginepy)
- [oc_install](#oc_install)
- [oc_install.bat](#oc_installbat)
- [requirements.txt](#requirementstxt)
- [requirements_desktop.txt](#requirements_desktoptxt)
- [requirements_desktop_macos.txt](#requirements_desktop_macostxt)
- [requirements_macos.txt](#requirements_macostxt)
- [requirements_ml.txt](#requirements_mltxt)
- [requirements_ml_macos.txt](#requirements_ml_macostxt)

## .env.example

### .env.example · template for backend/.env · _v0.1.0

Created in _v0.1.0.

## app/__init__.py

### app/__init__.py · version string · _v0.1.0

Created in _v0.1.0.

## app/core/__init__.py

### app/core/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/core/config.py

### app/core/config.py · ports, limits, folders, .env loading · _v0.1.0

Created in _v0.1.0.

## app/main.py

### app/main.py · app assembly, CORS, static mount · _v0.1.0

Created in _v0.1.0.

### app/main.py · generative router · _v0.37.0

Mounts `/api/generative`. Removed:

```py
from app.routers import io, ops, projects, system
```

## app/routers/__init__.py

### app/routers/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/routers/io.py

### app/routers/io.py · decode and export · _v0.1.0

Created in _v0.1.0.

## app/routers/ops.py

### app/routers/ops.py · remove background · _v0.1.0

Created in _v0.1.0.

## app/routers/projects.py

### app/routers/projects.py · save · _v0.1.0

Writes through a temporary file and `os.replace`, so a crash never leaves a half-written project.

### app/routers/projects.py · package · root folder · _v0.28.0

The package route takes an optional `root` form field, checked as a safe name, so a export unzips to `Name.ref/`. Removed:

```py
def package(manifest: str = Form(...), files: list[UploadFile] = File(default=[])) -> Response:
```

## app/routers/system.py

### app/routers/system.py · health, version, capabilities · _v0.1.0

Created in _v0.1.0.

## app/services/__init__.py

### app/services/__init__.py · package marker · _v0.1.0

Created in _v0.1.0.

## app/services/background.py

### app/services/background.py · remove · _v0.1.0

rembg is the default when installed; OpenCV GrabCut is always available. Both return a mask PNG, never cut pixels. Verified live: GrabCut isolates a test subject (center 255, corner 0); `ml` answers 501 when not installed.

## app/services/imaging.py

### app/services/imaging.py · decode_to_png · _v0.1.0

`pillow-heif` bundles GPL x265, so the frozen sidecar excludes it and macOS falls back to `sips`.

## app/services/project_format.py

### app/services/project_format.py · validate · _v0.1.0

Accepts `com.reference.project` 1 to 7 and `com.nodemode.formvis` 1; checks sizes, ids, folder parents, clip links, depth 64 and clip chains 256 before anything touches disk. Verified live: a version 9 manifest is rejected with 422.

### app/services/project_format.py · write_zip · root folder · _v0.28.0

`write_zip` wraps the manifest and images in an optional root folder. Removed:

```py
def write_zip(manifest: dict, assets: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in assets.items():
            archive.writestr(f"images/{name}", data)
```

## app/services/sessions.py

### app/services/sessions.py · opened-project sessions · _v0.1.0

Created in _v0.1.0.

## boot_backend

### boot_backend · start the engine (unix) · _v0.1.0

Created in _v0.1.0.

## boot_backend.bat

### boot_backend.bat · start the engine (windows) · _v0.1.0

Created in _v0.1.0.

## formvis_engine.py

### formvis_engine.py · main · _v0.1.0

Serves the bundled `frontend_dist`; with `FORMVIS_PORT=0` uvicorn prints `http://127.0.0.1:PORT`, which the Tauri shell parses. Verified live. `--selfcheck` prints dependency versions as JSON.

## oc_install

### oc_install · install this side (unix) · _v0.1.0

Created in _v0.1.0.

## oc_install.bat

### oc_install.bat · install this side (windows) · _v0.1.0

Created in _v0.1.0.

## requirements.txt

### requirements.txt · pinned base · _v0.1.0

Created in _v0.1.0.

## requirements_desktop.txt

### requirements_desktop.txt · pinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_desktop_macos.txt

### requirements_desktop_macos.txt · unpinned PyInstaller · _v0.1.0

Created in _v0.1.0.

## requirements_macos.txt

### requirements_macos.txt · unpinned base for macOS · _v0.1.0

Created in _v0.1.0.

## requirements_ml.txt

### requirements_ml.txt · pinned ML extra · _v0.1.0

Created in _v0.1.0.

## requirements_ml_macos.txt

### requirements_ml_macos.txt · unpinned ML extra · _v0.1.0

Created in _v0.1.0.
