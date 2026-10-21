# .af, .afphoto and .afdesign sample files

Real documents in the .af and .afdesign formats, used by `e2e/test_affinity_layers.py` and `frontend/tests/af-read.test.ts` to check the layered reader (`frontend/src/io/af-read.ts`). Each is MIT licensed; the license texts are quoted in `NOTICE.md`.

| File | Origin | Copyright | License | What it holds |
| --- | --- | --- | --- | --- |
| `lf_gauss10.af` | schist project, `fixtures/affinity-probe` (unified .af) | (c) 2026 Infrawrench LLC | MIT | one source-backed image layer named Background with a live Gaussian blur |
| `shp_arrow.af` | schist project, `fixtures/affinity-probe` | (c) 2026 Infrawrench LLC | MIT | an image layer and a vector arrow shape |
| `exposure.af` | schist project, `fixtures/affinity-probe` | (c) 2026 Infrawrench LLC | MIT | an image layer under an Exposure adjustment |
| `raster_test.afdesign` | AFDesignLoad (Designer 1.x file) | (c) 2015 Nick Beeuwsaert | MIT | a layer group holding one pixel layer |
| `layer_test.afdesign` | AFDesignLoad | (c) 2015 Nick Beeuwsaert | MIT | several empty layers (groups) |
| `layer_mode.afdesign` | AFDesignLoad | (c) 2015 Nick Beeuwsaert | MIT | one group per blend mode, named after the mode |
| `poster.af` | filex-media-thumbs | (c) 2026 BRF Tech | MIT | a minimal file that carries only a preview image |

MIT License. Permission is hereby granted, free of charge, to any person obtaining a copy of these files, to deal in them without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to the copyright notice above being included in all copies or substantial portions. The files are provided "as is", without warranty of any kind.
