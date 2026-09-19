# Project Format

A project is a zip (`.sonny`) or a the reference app package (`.ref`, zipped or a folder) holding `manifest.json` and an `images/` folder. sonny writes format `com.nodemode.sonny` version 1 and reads that plus `com.reference.project` versions 1 to 7.

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

- Field names and value labels match the reference app exactly; never rename them.
- Unknown fields inside `adjustment` and `shape` survive a round trip.
- A reader rejects versions it does not know instead of guessing.
