# Getting Started

Install once, then boot both sides with one command. Every command exists as a shell script (`./sonny ...`) and a Windows twin (`sonny.bat ...`).

| Command | What it does |
| --- | --- |
| `install` | Creates `backend/venv`, installs the pinned Python packages including the ML extra (rembg), and runs `npm install` in `frontend/` |
| `install --lite` | Same, but skips the ML extra; Remove Background then uses the lightweight GrabCut engine |
| `install-ml` | Adds rembg and onnxruntime later and fetches the background model |
| `install-desktop` | Adds PyInstaller and checks the Rust and Tauri toolchain |
| `boot` | Starts the engine on 8190 and the Vite dev server on 5190 |
| `backend` / `frontend` | Starts one side only |
| `build` | Production build of the frontend into `frontend/dist` |
| `serve` | Serves the built frontend and the API from the engine on 127.0.0.1:8190 |
| `freeze` | Freezes the engine into `src-tauri/binaries/sonny-engine-<target triple>` |
| `desktop dev` / `desktop build` | Runs or bundles the Tauri app |
| `doctor` | Checks the toolchain, the installs and the ports |
| `clean` | Removes build output; `clean --all` also removes `backend/venv` and `frontend/node_modules` |

| Service | URL | Notes |
| --- | --- | --- |
| Frontend (dev) | http://localhost:5190 | bound to localhost only, strict port |
| Engine | http://127.0.0.1:8190 | API under `/api` |
| Preview | http://localhost:5191 | production build preview |

The engine keeps projects in `~/Sonny/Projects` and desktop exports in `~/Sonny/Exports`; `SONNY_DATA_DIR` moves both.
