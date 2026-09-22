# Verification

## Automated tests

`./sonny test` runs three suites and exits non-zero if any fails; name one to run it alone.

- `unit`: engine modules in Node through vitest (`frontend/tests`), no canvas or browser.
- `backend`: the engine service through FastAPI's test client with a throwaway data folder (`backend/tests`).
- `e2e`: Chromium through Playwright against the dev build (`e2e/`), which it starts on 5190 when nothing is running; install with `pip install pytest playwright` and `python -m playwright install chromium`.

CI runs all three on every push and pull request. A change that adds behaviour adds its tests in the same commit; the throttled run below still applies to anything touching the DOM, since tests do not catch flashes.

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
