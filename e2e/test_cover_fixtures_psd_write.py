import base64
import io
import struct

import psd_tools

from e2e.test_cover_files_flat_formats import CAPTURE
from e2e.fixtures_support import steady


def ok(page):
    page.locator(".cv-scrim:not([hidden]) .cv-dialog-foot button", has_text="OK").last.click()
    page.wait_for_timeout(900)


def resources(d):
    at = 30 + struct.unpack(">I", d[26:30])[0]
    end = at + 4 + struct.unpack(">I", d[at:at + 4])[0]
    i, out = at + 4, {}
    while i < end:
        nl = d[i + 6]
        o = i + 6 + ((1 + nl + 1) & ~1)
        size = struct.unpack(">I", d[o:o + 4])[0]
        out[struct.unpack(">H", d[i + 4:i + 6])[0]] = d[o + 4:o + 4 + size]
        i = o + 4 + ((size + 1) & ~1)
    return out


def saved(page, cmd="export-psd"):
    r = page.evaluate(CAPTURE, cmd)
    assert r, cmd
    return base64.b64decode(r["b64"])


@steady
def test_fill_layers_are_written_as_solid_gradient_and_pattern_fill_layers_a_second_reader_recognises(page, tmp_path):
    page.evaluate("() => window.formvis.engine.newDocument(64, 48, 'F', 'white')")
    for cmd in ("new-fill-solid", "new-fill-gradient", "new-fill-pattern"):
        assert page.evaluate(f"window.formvis.commands.run('{cmd}')")
        page.wait_for_timeout(900)
        ok(page)
    names = page.evaluate("window.formvis.engine.current.doc.layers.map((l) => l.name)")
    assert len(names) == 4, names
    data = saved(page)
    assert data[:4] == b"8BPS"
    psd = psd_tools.PSDImage.open(io.BytesIO(data))
    kinds = {l.name: l.kind for l in psd.descendants()}
    assert kinds[names[1]] == "solidcolorfill" and kinds[names[2]] == "gradientfill" and kinds[names[3]] == "patternfill", kinds


@steady
def test_a_multichannel_document_is_written_as_a_multichannel_psd_and_a_psb(page, tmp_path):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(32, 24, 'M', 'white'); e.fg = { r: 200, g: 40, b: 40 }; e.fill('fg'); }")
    assert page.evaluate("window.formvis.commands.run('mode-multichannel')")
    page.wait_for_timeout(1200)
    for cmd, version in (("export-psd", 1), ("export-psb", 2)):
        data = saved(page, cmd)
        assert data[:4] == b"8BPS" and data[5] == version
        assert int.from_bytes(data[24:26], "big") == 7, int.from_bytes(data[24:26], "big")
        assert struct.unpack(">HII", data[12:14] + data[14:22]) == (3, 24, 32), struct.unpack(">HII", data[12:14] + data[14:22])
        assert resources(data)[1006].startswith(b"\x04Cyan\x07Magenta\x06Yellow"), resources(data)[1006][:24]
        assert resources(data)[1005][:4] == struct.pack(">I", 72 << 16) or len(resources(data)[1005]) == 16
        info = resources(data)[1077]
        assert struct.unpack(">I", info[:4])[0] == 1 and len(info) == 4 + 14 * 3, len(info)
        for k in range(3):
            rec = info[4 + 14 * k:4 + 14 * (k + 1)]
            space, opacity, kind, pad = struct.unpack(">H", rec[:2])[0], struct.unpack(">H", rec[10:12])[0], rec[12], rec[13]
            assert (space, opacity, kind, pad) == (0, 100, 2, 0), (k, rec.hex())
