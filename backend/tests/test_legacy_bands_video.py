"""The band writers and the video router, read back by programs that are not formvis: Pillow, tifffile, a hand PSD parser, ffmpeg's own report."""

import io
import json
import shutil
import struct
import zipfile

import numpy as np
import pytest
import tifffile
from PIL import Image


def _picture(w=7, h=5):
    px = np.zeros((h, w, 4), np.uint8)
    px[..., 0] = np.arange(w, dtype=np.uint8)[None, :] * 30
    px[..., 1] = np.arange(h, dtype=np.uint8)[:, None] * 40
    px[..., 2] = 99
    px[..., 3] = 255
    px[0, 0, 3] = 17
    return px


def _send(client, route, key, px, step=2):
    for y in range(0, px.shape[0], step):
        r = client.post(f"{route}/{key}", content=px[y:y + step].tobytes())
        assert r.status_code == 200
    return r.json()["rows"]


def _icc():
    from PIL import ImageCms
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def test_png_bands_round_trip_with_pixels_and_resolution(client):
    px = _picture()
    key = client.post("/api/bands/png", params={"width": 7, "height": 5, "ppi": 300}).json()["key"]
    assert _send(client, "/api/bands/png", key, px) == 5
    data = client.post(f"/api/bands/png/{key}/end").content
    im = Image.open(io.BytesIO(data))
    assert im.mode == "RGBA" and im.size == (7, 5)
    assert np.array_equal(np.asarray(im), px)
    assert round(im.info["dpi"][0]) == 300


def test_png_bands_embed_the_icc_profile_under_its_name(client):
    icc = _icc()
    key = client.post("/api/bands/png", params={"width": 7, "height": 5, "name": "Mine"}, content=icc).json()["key"]
    _send(client, "/api/bands/png", key, _picture())
    im = Image.open(io.BytesIO(client.post(f"/api/bands/png/{key}/end").content))
    assert im.info["icc_profile"] == icc


def test_png_bands_refuse_short_pictures_and_odd_rows(client):
    key = client.post("/api/bands/png", params={"width": 7, "height": 5}).json()["key"]
    assert client.post(f"/api/bands/png/{key}", content=b"\0" * 10).status_code == 400
    assert client.post(f"/api/bands/png/{key}", content=bytes(7 * 4 * 6)).status_code == 400
    client.post(f"/api/bands/png/{key}", content=bytes(7 * 4 * 2))
    assert client.post(f"/api/bands/png/{key}/end").status_code == 400
    assert client.post("/api/bands/png", params={"width": 0, "height": 5}).status_code == 400
    assert client.post("/api/bands/png/nokey", content=b"").status_code == 404


def test_band_reader_refuses_unknown_keys_and_projects(client):
    assert client.get("/api/bands/read/none").status_code == 404
    assert client.post("/api/bands/read", params={"session": "nosuch", "file": "a.png"}).status_code == 404


def test_tiff_bands_read_with_an_independent_reader(client):
    px = _picture(11, 9)
    icc = _icc()
    key = client.post("/api/bands/tiff", params={"width": 11, "height": 9, "ppi": 150}, content=icc).json()["key"]
    _send(client, "/api/bands/tiff", key, px, 4)
    data = client.post(f"/api/bands/tiff/{key}/end").content
    with tifffile.TiffFile(io.BytesIO(data)) as t:
        page = t.pages[0]
        assert page.shape == (9, 11, 4)
        assert page.tags[34675].value == icc
        assert np.array_equal(page.asarray(), px)
        assert round(float(page.tags["XResolution"].value[0]) / page.tags["XResolution"].value[1]) == 150
    assert Image.open(io.BytesIO(data)).size == (11, 9)


def test_tiff_bands_refuse_missing_rows(client):
    key = client.post("/api/bands/tiff", params={"width": 4, "height": 4}).json()["key"]
    client.post(f"/api/bands/tiff/{key}", content=bytes(16))
    assert client.post(f"/api/bands/tiff/{key}/end").status_code == 400
    assert client.post("/api/bands/tiff/zz", content=b"").status_code == 404


def _psd_header(data):
    sig, ver, _res, ch, h, w, depth, mode = struct.unpack(">4sH6sHIIHH", data[:26])
    return sig, ver, ch, h, w, depth, mode


def _psd_planes(data, w, h, channels=4):
    pos = 26
    for _ in range(3):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        pos += 4 + n
    assert struct.unpack(">H", data[pos:pos + 2])[0] == 0
    raw = np.frombuffer(data[pos + 2:pos + 2 + channels * w * h], np.uint8)
    return raw.reshape(channels, h, w)


def test_flat_psd_has_a_valid_header_and_planar_pixels(client):
    px = _picture(6, 5)
    key = client.post("/api/bands/psd", params={"width": 6, "height": 5, "ppi": 144}).json()["key"]
    _send(client, "/api/bands/psd", key, px)
    data = client.post(f"/api/bands/psd/{key}/end").content
    assert _psd_header(data) == (b"8BPS", 1, 4, 5, 6, 8, 3)
    planes = _psd_planes(data, 6, 5)
    for c in range(4):
        assert np.array_equal(planes[c], px[..., c])
    assert b"8BIM\x03\xed" in data[:200]


def test_flat_psd_resolution_resource_and_icc(client):
    icc = _icc()
    key = client.post("/api/bands/psd", params={"width": 3, "height": 2, "ppi": 144}, content=icc).json()["key"]
    _send(client, "/api/bands/psd", key, _picture(3, 2))
    data = client.post(f"/api/bands/psd/{key}/end").content
    res_len = struct.unpack(">I", data[30:34])[0]
    res = data[34:34 + res_len]
    assert icc in res
    at = res.index(b"8BIM\x03\xed")
    assert struct.unpack(">I", res[at + 8:at + 12])[0] == 16
    assert struct.unpack(">I", res[at + 12:at + 16])[0] / 65536 == 144


def test_psb_uses_version_two_and_big_section_lengths(client):
    px = _picture(4, 3)
    key = client.post("/api/bands/psd", params={"width": 4, "height": 3, "psb": "true"}).json()["key"]
    _send(client, "/api/bands/psd", key, px)
    data = client.post(f"/api/bands/psd/{key}/end").content
    assert _psd_header(data)[:2] == (b"8BPS", 2)
    assert client.post("/api/bands/psd", params={"width": 30001, "height": 3}).status_code == 400
    assert client.post("/api/bands/psd", params={"width": 30001, "height": 3, "psb": "true"}).status_code == 200


def test_layered_psd_names_and_records_each_layer(client):
    layers = [
        {"name": "Back", "left": 0, "top": 0, "width": 4, "height": 3, "opacity": 1.0},
        {"name": "Folder", "section": 3},
        {"name": "Top", "left": 1, "top": 1, "width": 2, "height": 2, "opacity": 0.5, "blend": "multiply", "visible": False},
        {"name": "End", "section": 1},
    ]
    key = client.post("/api/bands/psdl", params={"width": 4, "height": 3}, json={"layers": layers}).json()["key"]
    back = _picture(4, 3)
    top = np.full((2, 2, 4), (10, 20, 30, 255), np.uint8)
    assert client.post(f"/api/bands/psdl/{key}/0", content=back.tobytes()).json() == {"rows": 3}
    assert client.post(f"/api/bands/psdl/{key}/2", content=top.tobytes()).json() == {"rows": 2}
    assert client.post(f"/api/bands/psdl/{key}/1", content=b"").status_code == 400
    assert client.post(f"/api/bands/psdl/{key}/end").status_code == 400
    client.post(f"/api/bands/psdl/{key}", content=back.tobytes())
    data = client.post(f"/api/bands/psdl/{key}/end").content
    assert _psd_header(data) == (b"8BPS", 1, 4, 3, 4, 8, 3)
    pos = 26
    for _ in range(2):
        pos += 4 + struct.unpack(">I", data[pos:pos + 4])[0]
    info_len = struct.unpack(">I", data[pos + 4:pos + 8])[0]
    count = struct.unpack(">h", data[pos + 8:pos + 10])[0]
    assert info_len > 0 and count == -4
    blob = data[pos:pos + 8 + 4 + info_len]
    assert b"Back" in blob and b"Folder" in blob and b"Top" in blob
    assert b"mul " in blob and b"lsct" in blob and b"luni" in blob
    im = Image.open(io.BytesIO(data))
    assert im.size == (4, 3)


def test_layered_psd_can_be_dropped_and_refuses_bad_input(client):
    key = client.post("/api/bands/psdl", params={"width": 4, "height": 3}, json={"layers": [{"name": "A", "width": 2, "height": 2}]}).json()["key"]
    assert client.delete(f"/api/bands/psdl/{key}").json() == {"dropped": True}
    assert client.delete(f"/api/bands/psdl/{key}").json() == {"dropped": False}
    assert client.post(f"/api/bands/psdl/{key}/0", content=bytes(16)).status_code == 404
    bad = client.post("/api/bands/psdl", params={"width": 4, "height": 3}, json={"layers": [], "icc": "abcde"})
    assert bad.status_code == 400
    big = client.post("/api/bands/psdl", params={"width": 4, "height": 3}, json={"layers": [{"name": "W", "width": 30001, "height": 1}]})
    assert big.status_code == 400


needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")


def _frames_png(n=3, size=(16, 12)):
    out = []
    for i in range(n):
        buf = io.BytesIO()
        Image.new("RGB", size, (60 * i, 100, 200)).save(buf, "PNG")
        out.append(buf.getvalue())
    return out


def test_sequence_numbers_the_frames_in_a_stored_zip(client):
    frames = _frames_png(3)
    r = client.post("/api/video/sequence", files=[("file", (f"{i}.png", f, "image/png")) for i, f in enumerate(frames)], data={"name": "my clip/../x"})
    assert r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.namelist() == ["my clipx_00001.png", "my clipx_00002.png", "my clipx_00003.png"]
    assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())
    assert z.read("my clipx_00002.png") == frames[1]


def test_encode_refuses_missing_delays_and_unreadable_ones(client):
    f = [("file", ("a.png", _frames_png(1)[0], "image/png"))]
    assert client.post("/api/video/encode", files=f, data={"delays": "[]"}).status_code == 422
    assert client.post("/api/video/encode", files=f, data={"delays": "nope"}).status_code == 422


@needs_ffmpeg
def test_encoded_video_is_probed_with_the_right_size_and_length(client):
    frames = _frames_png(4, (17, 11))
    files = [("file", (f"{i}.png", f, "image/png")) for i, f in enumerate(frames)]
    mp4 = client.post("/api/video/encode", files=files, data={"delays": json.dumps([100] * 4)})
    assert mp4.status_code == 200 and mp4.content[4:8] == b"ftyp"
    info = client.post("/api/video/probe", files={"file": ("clip.mp4", mp4.content, "video/mp4")}).json()
    assert (info["width"], info["height"]) == (16, 10)
    assert info["fps"] == pytest.approx(10, abs=0.5)
    assert info["duration"] == pytest.approx(0.4, abs=0.1)


@needs_ffmpeg
def test_frames_come_back_as_a_length_prefixed_header_and_pngs(client):
    frames = _frames_png(6, (16, 12))
    files = [("file", (f"{i}.png", f, "image/png")) for i, f in enumerate(frames)]
    mp4 = client.post("/api/video/encode", files=files, data={"delays": json.dumps([100] * 6)}).content
    r = client.post("/api/video/frames", files={"file": ("clip.mp4", mp4, "video/mp4")}, data={"every": 2})
    n = int.from_bytes(r.content[:4], "little")
    head = json.loads(r.content[4:4 + n])
    assert head["count"] == 3 and head["every"] == 2 and head["delayMs"] == 200
    assert (head["width"], head["height"]) == (16, 12) and len(head["sizes"]) == 3
    blob = r.content[4 + n:]
    first = Image.open(io.BytesIO(blob[:head["sizes"][0]]))
    assert first.size == (16, 12)
    r2 = client.post("/api/video/frames", files={"file": ("clip.mp4", mp4, "video/mp4")}, data={"max_side": 64, "max_frames": 2})
    n2 = int.from_bytes(r2.content[:4], "little")
    assert json.loads(r2.content[4:4 + n2])["count"] == 2


@needs_ffmpeg
def test_a_file_that_is_not_video_is_refused(client):
    assert client.post("/api/video/probe", files={"file": ("x.mp4", b"not a video at all", "video/mp4")}).status_code in (415, 422)
