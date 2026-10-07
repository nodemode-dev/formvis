# Project Format

A project is a zip (`.fmv`; before 0.90.0 `.formvis`, still read) holding `manifest.json` and an `images/` folder. formvis writes format `com.nodemode.formvis` version 1 and reads that and, since 0.97.0, NodeMode canvasor's `com.nodemode.canvasor` version 1 (`.canvasor`, a zip). Since 1.40.0 it also opens `.comp` projects (a zip, `.comp.zip` or the package folder), which share this layout and name themselves with a reverse-DNS id ending in `.project` at versions 1 to 7; they are recognised by that shape, held to the same validation, and saved as `.fmv`. formvis never writes `.comp`. A canvasor project has the layout below under its own id: layers bottom to top, each transform an origin and a displayed size that may differ from its image's size; it opens through the same reader and saves as `.fmv`. (NodeMode's canvasor plugin also saves `*.canvasor.json`, a different format that formvis does not read.)

| Manifest key | Meaning |
| --- | --- |
| `format`, `version` | Format id and version |
| `colorSpace`, `resolution` | Always `sRGB`; pixels per inch (72 when absent) |
| `documentID`, `width`, `height` | Document id and canvas size in pixels |
| `activeLayerID` | The selected layer |
| `layers` | Bottom-to-top layer records |
| `alphas` | Alpha channels (1.65.1): each `id`, `name` and `file`, a grayscale PNG the canvas's size in `images/` (white selected); absent when there are none |

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
