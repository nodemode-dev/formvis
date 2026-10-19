"""formvis engine.

OpenCV's OpenEXR codec stays off in this process (its parser has had security problems with untrusted files,
opencv/opencv#21326); app/services/contained.py decodes and encodes EXR in a child interpreter that turns it on for
itself alone (1.54.4, the parity plan's L14).

On Linux, ctypes.util.find_library falls back to `ld -t -o /dev/null -l<name>` when its compiler probe finds nothing,
and a failed link removes its output file: run as root, a lookup for a missing library (a dependency probing for the
macOS Security framework at import, for one) deleted /dev/null. The fallback is switched off for this process before
any dependency loads (1.89.8).
"""

import sys

if sys.platform.startswith("linux"):
    try:
        import ctypes.util

        if hasattr(ctypes.util, "_findLib_ld"):
            ctypes.util._findLib_ld = lambda name: None  # type: ignore[attr-defined]
    except ImportError:
        pass

__version__ = "1.91.1"
