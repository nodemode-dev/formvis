---
name: project-format
description: The sonny and the reference app project format. Use when reading or writing manifest.json, .sonny or .ref files, adding a layer field, changing mask, clipping, adjustment or transform encoding, bumping the format version, or when a reference project fails to open or loses data in a round trip.
---

# project-format

A project is `manifest.json` plus `images/`. sonny writes `com.nodemode.sonny` version 1 and reads that plus `com.reference.project` versions 1 to 7. Field names and value labels are the reference app's, verbatim.

## Where it lives

| Side | Path | Role |
| --- | --- | --- |
| Frontend | `frontend/src/io/project-io.ts` | `serialize` and `deserialize`, mask and transform encoding |
| Backend | `backend/app/services/project_format.py` | `validate`, zip and folder reading, zip writing |
| Docs | `.docs/wiki/Project-Format.md` | Field tables |

## Encoding facts

- `transform`: `origin` `[x, y]`, `size` `[w, h]`, `rotation` in degrees, `flipX`, `flipY`, `sampling` label (`Nearest`, `Smooth`, `High quality`).
- `blendMode` labels: `Normal`, `Multiply`, `Screen`, `Overlay`, `Darken`, `Lighten`, `Difference`, `Color Dodge`, `Color Burn`, `Hue`, `Saturation`, `Color`, `Luminosity`.
- Masks are grayscale PNGs where white shows; in memory the value sits in the alpha channel.
- `adjustment` and `shape` records survive verbatim, including fields sonny does not use.
- Clipping is `maskSourceID`; folders are `isGroup` with children pointing at them through `parentID`.

## Changing the format

1. Change the writer and the reader on both sides in the same commit.
2. A new field is optional on read, so older projects still open.
3. A breaking change bumps `FORMAT_VERSION` and the accepted range in `SUPPORTED`; keep reading every older version.
4. Update the wiki page and add round-trip cases to the sidecar `TEST_PLAN.md`.
