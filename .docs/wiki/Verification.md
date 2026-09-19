# Verification

Every change that touches the DOM passes a throttled browser run before it lands, because flashes and layout jumps are transients that a fast machine hides.

1. Build the frontend and serve it from the engine (`./sonny serve`), cache disabled.
2. Throttle the CPU at least 4x (6x is used) and the network to a slow profile (400 ms latency, 500 kbit/s), both together.
3. Hard-reload and record every frame: before reveal the page shows only the background color, and the first revealed frame must equal the settled frame (no theme flash, no font reflow).
4. Exercise every path the change touched, recording frames at the moment of change: new canvas, painting, selection and fill, visibility, rename, drag reorder, undo and redo, import, Remove Background, save, tabs, Open dialog, window resize, theme switch, export, folder collapse.
5. Measure layout shift (must be 0), keyed nodes rebuilt within one mutation batch (must be 0), page and console errors (must be 0), and stage frames that go blank while a document is open (must be 0).

Report the result as one of: verified under throttling, verified without throttling (and why), or not verified.
