---
name: ui-verification
description: The throttled browser verification every sonny UI change passes before hand-back. Use after touching any DOM, CSS, stage, panel, dialog or reveal code, when checking for flashes, font reflow, layout shift, blank canvas frames or rebuilt rows, or when asked whether a UI change was verified.
---

# ui-verification

Flashes and layout jumps are transients that a fast machine hides, so verification runs slow and records frames.

## Procedure

1. Build (`./sonny build`) and serve from the engine (`./sonny serve`).
2. Drive Chromium with Playwright. Over the DevTools protocol set `Emulation.setCPUThrottlingRate` to 6, `Network.emulateNetworkConditions` to 400 ms latency and 64,000 bytes per second, and `Network.setCacheDisabled`.
3. Record the hard reload with `Page.startScreencast`. Before reveal every frame is the background color; the first revealed frame must equal the settled frame.
4. Install two observers before load: a `layout-shift` PerformanceObserver, and a MutationObserver counting keyed nodes (`data-key`) removed and replaced by a different node within one batch. A moved node is not a rebuild.
5. Exercise every touched path with real input, recording frames at each change: new canvas, brush, new layer, marquee and fill, visibility, rename, drag reorder, undo and redo, import, Remove Background, save, tabs, Open dialog, resize, theme switch, export, folder collapse.
6. Pass means: layout shift 0, rebuilt keyed nodes 0, page and console errors 0, no blank stage frames while a document is open.

Report exactly one of: verified under throttling, verified without throttling (with the reason), or not verified.

## Keep in mind

- The harness is scratch code outside the repository: the repository carries no self-authored tests.
- The first screencast frame is the browser's `about:blank`, not the app.
- A dialog left open darkens a stage sample; check that dialogs actually closed before trusting blank-frame counts.
- Shell scripting: `pgrep -f` or `pkill -f` can match the calling shell when its script text contains the pattern; `cd dir && cmd &` backgrounds the `cd` too; `/bin/sh` has no brace expansion. Use `(cd dir && exec cmd) &` with `$!`, and plain loops.
