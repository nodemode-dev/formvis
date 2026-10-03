# Measured on real hardware

`./formvis bench` (from 1.61.5) times formvis's display paths on the computer it runs on, in Chrome with the graphics
processor switched on, and records the machine. These are the runs on the owner's computers, newest first: the evidence
for the register's H4 (GPU paths verified on real hardware).

## Apple M5 MacBook Air (Mac17,3), 2 October 2026, formvis 1.61.6

Chrome in the background, drawing through Apple Metal 3 for both WebGPU and WebGL2; 60 frames per test on the
benchmark document (2,000 by 1,500: a gradient, three blended layers with one masked, Levels and Hue/Saturation),
viewed 1,200 by 800 at 50%. Median milliseconds per frame, 90th percentile in brackets.

| Test | CPU | WebGPU | WebGL2 |
|---|---|---|---|
| Pan: blended and masked layers | 0.8 (1.4) | 0.7 (1.0) | 0.7 (1.0) |
| Pan: with Levels and Hue/Saturation layers | 20.0 (23.9) | 0.9 (1.2) | 0.8 (0.9) |
| Paint: a dab per frame | 0.8 (0.9), region redraw | 1.0 (1.2), full frame | 1.0 (1.2), full frame |

The native renderer's brush benchmark (200 pointer updates on a 4,000 px document): median 0.47 ms, 95th percentile
0.95 ms, worst 8.40 ms, against the published target of under 3 ms per update.

What it shows: every GPU path stays near a millisecond a frame. The CPU matches it for plain layers and painting, but
takes 20 ms once adjustment layers are in the picture, 22 times the GPU's time. Automatic (WebGPU first on a hardware
graphics processor) is within 0.2 ms of the fastest path in every test, so on this computer it picks the fastest path.

Not yet measured on this computer: whether each GPU path draws exactly what the CPU draws (`./formvis bench` checks it
from 1.61.7, against the bar formvis's GPU adjustment tests use: 99% of values within 4 levels), and the Channels view
through the native renderer, which needs the desktop app (H3).
