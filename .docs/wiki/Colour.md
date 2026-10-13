# Colour

Document modes (RGB, Gray, CMYK, Lab), depth (8, 16 and 32 bits a channel), profiles and conversions. The engine does the colour maths; the window holds the pixels.

| Source path | What lives there |
| --- | --- |
| `backend/app/services/lcms.py` | LittleCMS 2 through `ctypes` on the `liblcms2` that Pillow's wheel carries (a system library as the fallback): double precision transforms with `HIGHRESPRECALC`, one rounding to 16 bits (`quantise`, optional triangular dither), black-preserving intents for CMYK to CMYK, gray profiles LittleCMS builds itself, total ink detection |
| `backend/app/services/colour.py`, `routers/colour.py` | Profiles, tables for the 8-bit paths (`lut`, with CMYK and gray sources), `convert_deep` and `POST /api/color/convert-deep` for 16-bit and float channels, `POST /api/color/profile-info` (total ink, black at the darkest RGB, black generation) |
| `backend/app/profiles/FOGRA39L_coated.icc` | The working CMYK profile when none is chosen (see NOTICE.md) |
| `backend/app/services/dpx.py` | DPX (SMPTE 268M v2.0): reads 8, 10, 12 and 16 bits in both byte orders, filled and packed, RGB, RGBA, ABGR and luma; writes 8, 10, 12 and 16 bits; transfers 1 and 3 go through the Cineon curve, 2 is linear |
| `frontend/src/ui/colour-settings.ts`, `ui/panels/colour-settings-dialog.ts` | Edit > Color Settings (`colour.settings`, Shift+Mod+K): working RGB, CMYK and Gray, a policy for each (preserve, convert, off), ask on mismatch and on a missing profile, intent, black point compensation, dither; saved in Preferences |
| `frontend/src/ui/panels/colour-dialogs.ts` | Assign and Convert to Profile; `convertDocumentDeep` sends every layer's floats to the engine and `engine.convertDeepDocument` replaces them in one step |
| `frontend/src/io/dpx.ts` | `dpxBlob` writes the document at its depth for Export As |
| `frontend/src/engine/colour-lut.ts`, `ui/colour.ts`, `ui/colour-display.ts` | The tables and the display and proof path |

## Rules

- Nothing drops depth or ink quietly: what is not built at a depth or mode waits in the menu.
- Dither defaults off so plain conversions stay exact.
- 32-bit documents convert between RGB spaces only; other destinations refuse with a message.
- The colour engine is LittleCMS (MIT) and nothing else; no other colour code is pasted in.
