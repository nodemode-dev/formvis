"""Writes the HEIC test pictures beside this file from synthetic pixels (no photograph, nothing third-party).

The engine only decodes HEIC, so writing these needs an encoder: pillow-heif's PyPI wheel, whose x265 is GPL. Run it
in a throwaway virtual environment, never the engine's, and commit only the pictures:

    python3 -m venv /tmp/heif-enc && /tmp/heif-enc/bin/pip install pillow==12.3.0 pillow-heif==1.8.1 numpy
    /tmp/heif-enc/bin/python backend/tests/fixtures/make_heif_fixtures.py

All three are lossless (4:4:4, identity matrix, full range), so tests/test_heif.py can check exact pixel values.
"""
from pathlib import Path

import numpy as np
import pillow_heif

HERE = Path(__file__).resolve().parent
LOSSLESS = {"quality": -1, "chroma": 444, "matrix_coefficients": 0, "full_range_flag": 1}


def ramp(width: int, height: int, top: int) -> np.ndarray:
    y, x = np.mgrid[0:height, 0:width]
    return np.dstack([x * top // (width - 1), y * top // (height - 1), np.full((height, width), top // 2)])


def main() -> None:
    eight = ramp(16, 12, 255).astype(np.uint8)
    pillow_heif.from_bytes("RGB", (16, 12), eight.tobytes()).save(HERE / "heic_8bit.heic", **LOSSLESS)
    ten = ramp(16, 12, 1023).astype(np.uint16) << 6
    pillow_heif.from_bytes("RGB;16", (16, 12), ten.tobytes()).save(HERE / "heic_10bit.heic", **LOSSLESS)
    two = pillow_heif.from_bytes("RGB", (8, 6), np.full((6, 8, 3), (200, 40, 40), np.uint8).tobytes())
    two.add_frombytes("RGB", (4, 4), np.full((4, 4, 3), (30, 60, 220), np.uint8).tobytes())
    two.save(HERE / "heic_two_images.heic", **LOSSLESS)


if __name__ == "__main__":
    main()
