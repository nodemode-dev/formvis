# Project Format

A project is a zip (`.sny`; before 0.90.0 `.sonny`, still read) or a package (`.ref`, zipped or a folder) holding `manifest.json` and an `images/` folder. sonny writes format `com.nodemode.sonny` version 1 and reads that plus `com.reference.project` versions 1 to 7.

Since 0.28.0, File > Export .ref Project writes `Name.ref.zip`, which unzips to a `Name.ref` package (format `com.reference.project` version 7) that apps reading that format can open. That format is stricter in a few places, so the export regenerates any non-UUID id, names image files after the ids, strips opacity and blend mode from folders, drops pixels from adjustment layers, names unnamed layers "Layer" and clamps the resolution to 1 to 9600, reporting each change in a toast.

| Manifest key | Meaning |
| --- | --- |
| `format`, `version` | Format id and version |
| `colorSpace`, `resolution` | Always `sRGB`; pixels per inch (72 when absent) |
| `documentID`, `width`, `height` | Document id and canvas size in pixels |
| `activeLayerID` | The selected layer |
| `layers` | Bottom-to-top layer records |

| Layer key | Meaning |
| --- | --- |
| `id`, `name`, `isVisible` | Identity and visibility |
| `transform` | `origin` `[x, y]`, `size` `[w, h]`, `rotation` degrees, `flipX`, `flipY`, `sampling` (`Nearest`, `Smooth`, `High quality`) |
| `imageFile` | `images/<id>.png`, absent for folders and adjustments |
| `parentID`, `isGroup` | Folder membership and folder flag |
| `opacity`, `blendMode` | 0 to 1; blend label such as `Multiply` or `Color Dodge` |
| `maskFile`, `maskEnabled`, `maskLinked`, `maskPlacement` | Grayscale mask PNG (white shows), on or off, follows the layer or not, where an unlinked mask sits |
| `maskSourceID` | The layer this one is clipped to |
| `adjustment` | Kept verbatim; `kind` is `Hue/Saturation`, `Levels`, `Curves`, `Exposure`, `Gradient Map` or `Grain` |
| `shape` | Shape description, kept verbatim |

## Contract

- Field names and value labels match exactly; never rename them.
- Unknown fields inside `adjustment` and `shape` survive a round trip.
- A reader rejects versions it does not know instead of guessing.
