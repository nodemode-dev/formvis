"""Engine routes that had no test: the undo store, the scratch disk, 16-bit PNM, DPX and TIFF writers, and the status routes.
Each response is read back as bytes the way another program would."""

import io
import uuid

import numpy as np
import pytest
import tifffile
from PIL import Image


def _rgba16(width=4, height=3):
    px = np.zeros((height, width, 4), "<u2")
    px[..., 0] = 65535
    px[..., 1] = np.arange(width, dtype="<u2")[None, :] * 1000
    px[..., 3] = 65535
    return px


def test_health_and_version_report_the_engine(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    v = client.get("/api/version").json()
    assert v["name"] and v["version"].count(".") == 2


def test_the_undo_store_keeps_returns_and_forgets_bytes(client):
    body = bytes(range(256)) * 40
    r = client.post("/api/undo", content=body).json()
    assert r["bytes"] == len(body) and r["stored"] < len(body) and len(r["key"]) == 32
    assert client.get(f"/api/undo/{r['key']}").content == body
    assert client.delete(f"/api/undo/{r['key']}").status_code == 200
    assert client.get(f"/api/undo/{r['key']}").status_code == 404


def test_the_undo_store_refuses_nothing_and_bad_keys(client):
    assert client.post("/api/undo", content=b"").status_code == 400
    assert client.get("/api/undo/not-a-key").status_code == 400
    assert client.get(f"/api/undo/{uuid.uuid4().hex}").status_code == 404


def test_dropping_many_undo_keys_counts_only_those_kept(client):
    keys = [client.post("/api/undo", content=bytes([i]) * 64).json()["key"] for i in range(3)]
    r = client.post("/api/undo/drop", json={"keys": keys + ["short", uuid.uuid4().hex]})
    assert r.json() == {"dropped": 3}
    assert client.post("/api/undo/drop", json={"keys": "x"}).status_code == 400
    assert all(client.get(f"/api/undo/{k}").status_code == 404 for k in keys)


def test_the_scratch_disk_moves_and_returns(client, tmp_path):
    base = client.get("/api/undo/scratch").json()
    assert base["custom"] is False and base["free"] > 0
    moved = client.put("/api/undo/scratch", json={"folder": str(tmp_path / "fast")}).json()
    assert moved["custom"] is True and moved["folder"].endswith("formvis-undo")
    key = client.post("/api/undo", content=b"scratch" * 100).json()["key"]
    assert (tmp_path / "fast" / "formvis-undo" / f"{key}.z").is_file()
    back = client.put("/api/undo/scratch", json={"folder": ""}).json()
    assert back["custom"] is False
    assert client.get(f"/api/undo/{key}").content == b"scratch" * 100


def test_ppm_at_16_bits_is_written_with_a_maxval_of_65535(client):
    px = _rgba16()
    r = client.post("/api/io/encode-pnm", data={"width": 4, "height": 3, "kind": "ppm"}, files={"file": ("p.raw", px.tobytes())})
    assert r.status_code == 200 and r.content.startswith(b"P6")
    head, _, rest = r.content.partition(b"65535\n")
    assert b"4 3" in head
    samples = np.frombuffer(rest, ">u2").reshape(3, 4, 3)
    assert tuple(samples[0, 0]) == (65535, 0, 0) and samples[0, 3][1] == 3000


def test_pnm_refuses_pixels_that_do_not_match_the_size(client):
    r = client.post("/api/io/encode-pnm", data={"width": 4, "height": 4, "kind": "ppm"}, files={"file": ("p.raw", _rgba16().tobytes())})
    assert r.status_code == 422


@pytest.mark.parametrize("bits", [8, 10, 12, 16])
def test_dpx_is_written_at_each_depth_with_its_header(client, bits):
    r = client.post("/api/io/encode-dpx", data={"width": 4, "height": 3, "bits": bits, "transfer": "linear", "big_endian": "true"}, files={"file": ("p.raw", _rgba16().tobytes())})
    assert r.status_code == 200 and r.content[:4] == b"SDPX"
    assert int.from_bytes(r.content[772:776], "big") == 4 and int.from_bytes(r.content[776:780], "big") == 3


def test_dpx_little_endian_has_the_swapped_magic(client):
    r = client.post("/api/io/encode-dpx", data={"width": 4, "height": 3, "bits": 10, "big_endian": "false"}, files={"file": ("p.raw", _rgba16().tobytes())})
    assert r.content[:4] == b"XPDS"


def test_dpx_refuses_pixels_that_do_not_match_the_size(client):
    r = client.post("/api/io/encode-dpx", data={"width": 9, "height": 9}, files={"file": ("p.raw", b"\x00" * 16)})
    assert r.status_code == 422


def test_cmyk_tiff16_reads_back_with_the_inks_sent(client):
    v = np.zeros((3, 4, 4), "<u2")
    v[..., 0], v[..., 1], v[..., 3] = 65535, 32768, 1000
    r = client.post("/api/io/encode-tiff16", data={"width": 4, "height": 3, "space": "cmyk"}, files=[("file", ("values.raw", v.tobytes()))])
    assert r.status_code == 200
    got = tifffile.imread(io.BytesIO(r.content))
    assert got.shape == (3, 4, 4) and got.dtype == np.uint16
    assert (got == v).all()


def test_lab_tiff16_is_written_as_cielab(client):
    v = np.zeros((2, 2, 3), "<u2")
    v[..., 0] = 40000
    v[..., 1:] = 32768
    r = client.post("/api/io/encode-tiff16", data={"width": 2, "height": 2, "space": "lab"}, files=[("file", ("values.raw", v.tobytes()))])
    assert r.status_code == 200
    with tifffile.TiffFile(io.BytesIO(r.content)) as t:
        assert t.pages[0].photometric == tifffile.PHOTOMETRIC.CIELAB
        assert t.pages[0].asarray()[0, 0, 0] == 40000


def test_tiff16_refuses_a_wrong_space_and_wrong_length(client):
    assert client.post("/api/io/encode-tiff16", data={"width": 2, "height": 2, "space": "hsv"}, files=[("file", ("values.raw", b"\x00" * 24))]).status_code == 422
    assert client.post("/api/io/encode-tiff16", data={"width": 2, "height": 2, "space": "cmyk"}, files=[("file", ("values.raw", b"\x00" * 5))]).status_code == 422


def test_encode_png_round_trips_the_pixels(client):
    src = io.BytesIO()
    Image.new("RGBA", (5, 4), (10, 200, 30, 255)).save(src, "PNG")
    r = client.post("/api/io/encode", data={"format": "png"}, files={"file": ("a.png", src.getvalue())})
    assert r.status_code == 200
    assert Image.open(io.BytesIO(r.content)).convert("RGBA").getpixel((2, 2)) == (10, 200, 30, 255)
