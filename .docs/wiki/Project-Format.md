# Project Format

A project is a zip (`.sny`; before 0.90.0 `.sonny`, still read) holding `manifest.json` and an `images/` folder. sonny writes format `com.nodemode.sonny` version 1 and reads that and, since 0.97.0, NodeMode canvasor's `com.nodemode.canvasor` version 1 (`.canvasor`, a zip). A canvasor project has the layout below under its own id: layers bottom to top, each transform an origin and a displayed size that may differ from its image's size; it opens through the same reader and saves as `.sny`. (NodeMode's canvasor plugin also saves `*.canvasor.json`, a different format that sonny does not read.)

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
