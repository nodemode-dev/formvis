"""formvis engine.

OpenCV's OpenEXR codec stays off in this process (its parser has had security problems with untrusted files,
opencv/opencv#21326); app/services/contained.py decodes and encodes EXR in a child interpreter that turns it on for
itself alone (1.54.4, the parity plan's L14).
"""

__version__ = "1.87.3"
