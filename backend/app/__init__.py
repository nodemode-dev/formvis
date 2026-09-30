"""formvis engine."""

import os

# 32-bit documents (1.53.9, the parity plan's H1): OpenEXR is off in OpenCV by default, because its parser has had
# security problems with untrusted files (opencv/opencv#21326). formvis opens the person's own files on their own
# machine, so it is turned on for the engine, before OpenCV is first imported.
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")

__version__ = "1.54.3"
