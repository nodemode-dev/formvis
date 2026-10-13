# Throttled browser verification

Every formvis UI change passes this before hand-back. Flashes and layout jumps are transients that a fast machine hides, so verification runs slow and records frames. Carried over from the former `ui-verification` sub-skill.

## Procedure

1. Build (`./formvis build`) and serve from the engine (`./formvis serve`).
2. Drive Chromium with Playwright. Over the DevTools protocol set `Emulation.setCPUThrottlingRate` to 6, `Network.emulateNetworkConditions` to 400 ms latency and 64,000 bytes per second, and `Network.setCacheDisabled`.
3. Record the hard reload with `Page.startScreencast`. Before reveal every frame is the background colour; the first revealed frame must equal the settled frame.
4. Install two observers before load: a `layout-shift` PerformanceObserver, and a MutationObserver counting keyed nodes (`data-key`) removed and replaced by a different node within one batch. A moved node is not a rebuild.
5. Exercise every touched path with real input, recording frames at each change: new canvas, brush, new layer, marquee and fill, visibility, rename, drag reorder, undo and redo, import, Remove Background, save, tabs, Open dialog, resize, theme switch, export, folder collapse.
6. Pass means: layout shift 0, rebuilt keyed nodes 0, page and console errors 0, no blank stage frames while a document is open.

Report exactly one of: verified under throttling, verified without throttling (with the reason), or not verified.

## Keep in mind

- The harness is scratch code outside the repository (use the session scratchpad). The existing browser suite in `e2e/` includes `test_no_flash.py`, `test_no_layout_shift.py`, `test_no_scrollbars.py`, `test_layout_integrity.py` and `test_options_overflow.py`; run those that match your change with `./formvis test e2e` after `./formvis boot` provides the dev build on port 5190.
- The first screencast frame is the browser's `about:blank`, not the app.
- A dialog left open darkens a stage sample; check that dialogs actually closed before trusting blank-frame counts.
- Shell scripting: `pgrep -f` or `pkill -f` can match the calling shell when its script text contains the pattern; `cd dir && cmd &` backgrounds the `cd` too; `/bin/sh` has no brace expansion. Use `(cd dir && exec cmd) &` with `$!`, and plain loops.
