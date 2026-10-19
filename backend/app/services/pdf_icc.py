"""An RGB ICC profile carried by the images of a PDF that Pillow wrote.

Pillow's PDF writer draws every page image with a device colour space. This rewrites the file with the profile in an
ICCBased colour space (a stream object) that each image names, so a viewer reads the pixels as that profile's colour.
Pillow's PDF has plain objects and no object streams, which is all this reads."""

import re

_OBJECT = re.compile(rb"\s*(\d+) 0 obj")


def _objects(pdf: bytes) -> tuple[bytes, dict[int, bytes], bytes]:
    """The header, each object's body by number, and the trailer dictionary."""
    start = pdf.index(b"\n", pdf.index(b"%PDF")) + 1
    while pdf[start : start + 1] == b"%":
        start = pdf.index(b"\n", start) + 1
    header = pdf[:start]
    bodies: dict[int, bytes] = {}
    at = start
    while True:
        found = _OBJECT.match(pdf, at)
        if not found:
            break
        body_start = found.end()
        stream = pdf.find(b"stream", body_start)
        close = pdf.find(b"endobj", body_start)
        if close < 0:
            raise ValueError("an object is not closed")
        if 0 <= stream < close:
            length = re.search(rb"/Length (\d+)", pdf[body_start:stream])
            if not length:
                raise ValueError("a stream has no length")
            data = stream + len(b"stream") + (2 if pdf[stream + 6 : stream + 8] == b"\r\n" else 1)
            close = pdf.find(b"endobj", data + int(length.group(1)))
        bodies[int(found.group(1))] = pdf[body_start:close]
        at = close + len(b"endobj")
    trailer = re.search(rb"trailer\s*(<<.*?>>)\s*startxref", pdf[at:], re.S)
    if not bodies or not trailer:
        raise ValueError("not a PDF this can read")
    return header, bodies, trailer.group(1)


def embed_rgb_profile(pdf: bytes, profile: bytes) -> tuple[bytes, int]:
    """`pdf` with `profile` (an RGB ICC profile) as the colour space of its images, and how many images got it.
    Raises ValueError when the file is not one this can rewrite."""
    header, bodies, trailer = _objects(pdf)
    number = max(bodies) + 1
    space = b"/ColorSpace [ /ICCBased %d 0 R ]" % number
    changed = 0
    for key, body in bodies.items():
        head = body[: body.find(b"stream")] if b"stream" in body else body
        if b"/Subtype /Image" not in head:
            continue
        if b"/ColorSpace" in head:
            if b"/ColorSpace /DeviceRGB" not in head:
                continue
            bodies[key] = body.replace(b"/ColorSpace /DeviceRGB", space, 1)
        else:
            bodies[key] = body.replace(b"/Length", space + b"\n/Length", 1)
        changed += 1
    if not changed:
        return pdf, 0
    bodies[number] = b"<<\n/N 3\n/Alternate /DeviceRGB\n/Length %d\n>>stream\n" % len(profile) + profile + b"\nendstream\n"
    out = bytearray(header)
    offsets = {}
    for key in sorted(bodies):
        offsets[key] = len(out)
        out += b"%d 0 obj" % key + bodies[key] + b"endobj\n"
    table = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (number + 1)
    for key in range(1, number + 1):
        out += (b"%010d 00000 n \n" % offsets[key]) if key in offsets else b"0000000000 65535 f \n"
    trailer = re.sub(rb"/Size \d+", b"/Size %d" % (number + 1), trailer)
    out += b"trailer\n" + trailer + b"\nstartxref\n%d\n%%%%EOF\n" % table
    return bytes(out), changed
