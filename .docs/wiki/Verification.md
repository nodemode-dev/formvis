# Verification

## Automated tests

`./sonny test` runs three suites and exits non-zero if any fails; name one to run it alone.

- `unit`: engine modules in Node through vitest (`frontend/tests`), no canvas or browser.
- `backend`: the engine service through FastAPI's test client with a throwaway data folder (`backend/tests`).
- `e2e`: Chromium through Playwright against the dev build (`e2e/`), which it starts on 5190 when nothing is running; install with `pip install pytest playwright` and `python -m playwright install chromium`.

CI runs all three on every push and pull request. A change that adds behaviour adds its tests in the same commit; the throttled run below still applies to anything touching the DOM, since tests do not catch flashes.

Scripted checks switch tools with `engine.setTool(id)` and confirm `engine.tool` afterwards; there are no `tool-...` commands, and running an unknown command id quietly does nothing. A step that looks for a control must fail when the control is missing, never skip it, or the check measures an empty screen.

## Throttled browser run

Every change that touches the DOM passes a throttled browser run before it lands, because flashes and layout jumps are transients that a fast machine hides.

1. Build the frontend and serve it from the engine (`./sonny serve`), cache disabled.
2. Throttle the CPU at least 4x (6x is used) and the network to a slow profile (400 ms latency, 500 kbit/s), both together.
3. Hard-reload and record every frame: before reveal the page shows only the background color, and the first revealed frame must equal the settled frame (no theme flash, no font reflow).
4. Exercise every path the change touched, recording frames at the moment of change: new canvas, painting, selection and fill, visibility, rename, drag reorder, undo and redo, import, Remove Background, save, tabs, Open dialog, window resize, theme switch, export, folder collapse.
5. Measure layout shift (must be 0), keyed nodes rebuilt within one mutation batch (must be 0), page and console errors (must be 0), and stage frames that go blank while a document is open (must be 0).

6. Check behavior with real pointer and keyboard input against values predicted before the run (pixel values, band degrees, mask pixel counts), and give each new dialog or panel its own throttled check: no layout shift while it opens, updates and closes, and one stable size throughout.
7. The full run takes close to five minutes of wall time; run it on its own rather than chained after other work, and update its steps when a flow changes (the Remove Background step now opens the refine panel and presses OK).

Report the result as one of: verified under throttling, verified without throttling (and why), or not verified.

A shift in a scripted run is not always a jump. Browsers leave out of layout shift any shift within half a second of real input, and the throttled run's steps are scripts, which carry none. So a list that grows because of the step itself (a folder or artboard added pushes the Layers panel row below it down by exactly one row, 0.00048 at the usual window size) is counted in a scripted run and not after a real click. Before calling such a shift expected, drive the same action with a real click and read each layout-shift entry's `hadRecentInput` and its sources' previous and current rectangles: an expected one moves whole rows by whole row heights and is marked as following input. Anything else is a fault. (Checked in 0.93.0 for New Folder: the row moves from y 161 to 201, 40 px, and the clicked run scores 0.)
