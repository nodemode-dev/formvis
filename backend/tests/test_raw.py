import io
from pathlib import Path

from PIL import Image

from app.services import imaging

DNG = (Path(__file__).parent / "fixtures" / "synthetic.dng").read_bytes()


def test_the_engine_reports_its_raw_decoder():
    d = imaging.decoders()
    assert d["raw"] is True and d["rawEngine"].startswith("LibRaw "), d


def test_a_dng_is_developed_from_its_sensor_data():
    # synthetic.dng (made by fixtures/make_synthetic_dng.py) is a 64 by 48 Bayer mosaic, red scene left, blue right.
    png, w, h = imaging.decode_to_png(DNG, "photo.dng")
    assert (w, h) == (64, 48)
    with Image.open(io.BytesIO(png)) as im:
        rgb = im.convert("RGB")
        (lr, lg, lb), (rr, rg, rb) = rgb.getpixel((8, 24)), rgb.getpixel((56, 24))
    assert lr > 200 and lr > lb + 100 and lr > lg + 100, (lr, lg, lb)      # the red half, demosaiced
    assert rb > 200 and rb > rr + 100 and rb > rg + 100, (rr, rg, rb)      # the blue half


def test_a_damaged_raw_says_so_plainly():
    try:
        imaging.decode_to_png(b"not a raw file at all", "broken.nef")
    except imaging.DecodeError as err:
        assert "could not be read as a camera RAW file" in str(err) and "Input/output" not in str(err)
    else:
        raise AssertionError("a damaged RAW decoded")


def test_the_decode_endpoint_takes_raw(client):
    r = client.post("/api/io/decode", files={"file": ("photo.dng", DNG, "application/octet-stream")})
    assert r.status_code == 200 and (r.headers["X-Width"], r.headers["X-Height"]) == ("64", "48")
    with Image.open(io.BytesIO(r.content)) as im:
        assert im.format == "PNG" and im.size == (64, 48)
    bad = client.post("/api/io/decode", files={"file": ("broken.cr2", b"\x00" * 64, "application/octet-stream")})
    assert bad.status_code == 415
