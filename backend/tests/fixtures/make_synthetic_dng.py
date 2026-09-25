"""Writes synthetic.dng, the camera RAW fixture for tests/test_raw.py: a 64 by 48 RGGB Bayer mosaic, 12-bit, whose left
half is a red scene and right half a blue one, with an identity colour matrix and neutral white balance. Made here, so no
photograph or third-party file enters the repository. Needs `pip install pidng`; the tests read the committed file and do
not run this.
"""

import numpy as np
from pidng.core import RAW2DNG, DNGTags, Tag
from pidng.defs import CalibrationIlluminant, CFAPattern, DNGVersion, Orientation, PhotometricInterpretation, PreviewColorSpace

W, H = 64, 48
bayer = np.zeros((H, W), dtype=np.uint16)
for y in range(H):
    for x in range(W):
        r, g, b = (3600, 300, 300) if x < W // 2 else (300, 300, 3600)
        bayer[y, x] = r if (y % 2 == 0 and x % 2 == 0) else b if (y % 2 == 1 and x % 2 == 1) else g

t = DNGTags()
t.set(Tag.ImageWidth, W)
t.set(Tag.ImageLength, H)
t.set(Tag.TileWidth, W)
t.set(Tag.TileLength, H)
t.set(Tag.Orientation, Orientation.Horizontal)
t.set(Tag.PhotometricInterpretation, PhotometricInterpretation.Color_Filter_Array)
t.set(Tag.SamplesPerPixel, 1)
t.set(Tag.BitsPerSample, 16)
t.set(Tag.CFARepeatPatternDim, [2, 2])
t.set(Tag.CFAPattern, CFAPattern.RGGB)
t.set(Tag.BlackLevel, 0)
t.set(Tag.WhiteLevel, 4095)
t.set(Tag.ColorMatrix1, [[1, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1], [0, 1], [0, 1], [1, 1]])
t.set(Tag.CalibrationIlluminant1, CalibrationIlluminant.D65)
t.set(Tag.AsShotNeutral, [[1, 1], [1, 1], [1, 1]])
t.set(Tag.Make, "sonny")
t.set(Tag.Model, "synthetic")
t.set(Tag.DNGVersion, DNGVersion.V1_4)
t.set(Tag.DNGBackwardVersion, DNGVersion.V1_2)
t.set(Tag.PreviewColorSpace, PreviewColorSpace.sRGB)

if __name__ == "__main__":
    d = RAW2DNG()
    d.options(t, path="", compress=False)
    d.convert(bayer, filename="synthetic")
