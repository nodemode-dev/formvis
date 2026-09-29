"""Pictures larger than formvis edits in one piece (1.52.7): measured from the header, reduced, a region, tiles."""

import io

from PIL import Image

from app.core import config


def big_png(w=32_000, h=600):
    im = Image.new("RGB", (w, h), (20, 40, 60))
    for x in range(0, w, 1000):
        im.paste((200, 100, 50), (x, 0, x + 10, h))   # a stripe every 1,000 px, to see where things came from
    b = io.BytesIO(); im.save(b, "PNG", compress_level=1); return b.getvalue()


def test_a_picture_over_the_limit_is_measured_reduced_cut_and_tiled(client):
    data = big_png()
    info = client.post("/api/large", files={"file": ("wide.png", data, "image/png")}).json()
    assert (info["width"], info["height"], info["format"]) == (32_000, 600, "PNG") and info["memory"] == 32_000 * 600 * 4
    pid = info["id"]
    red = Image.open(io.BytesIO(client.get(f"/api/large/{pid}/reduced", params={"max_side": 8000}).content))
    assert red.size == (8000, 150)                                                                         # fits, the shape kept
    reg = Image.open(io.BytesIO(client.get(f"/api/large/{pid}/region", params={"x": 30_995, "y": 0, "w": 20, "h": 10}).content)).convert("RGB")
    assert reg.size == (20, 10) and reg.getpixel((4, 5)) == (20, 40, 60) and reg.getpixel((5, 5)) == (200, 100, 50)   # full size, from x 31,000
    grid = client.get(f"/api/large/{pid}/tiles", params={"size": 10_000}).json()
    assert [(t["col"], t["x"], t["width"]) for t in grid] == [(0, 0, 10_000), (1, 10_000, 10_000), (2, 20_000, 10_000), (3, 30_000, 2_000)] and all(t["height"] == 600 for t in grid)
    assert client.get(f"/api/large/{pid}/region", params={"x": 31_990, "y": 0, "w": 20, "h": 10}).status_code == 422   # past the edge
    assert client.get(f"/api/large/{pid}/region", params={"x": 0, "y": 0, "w": 30_001, "h": 10}).status_code == 422    # past formvis's limit
    client.delete(f"/api/large/{pid}")
    assert client.get(f"/api/large/{pid}/tiles").status_code == 404 and not any((config.data_dir() / "large").iterdir())


def test_what_is_not_a_picture_or_is_too_large_is_refused(client):
    assert client.post("/api/large", files={"file": ("x.png", b"not a picture", "image/png")}).status_code == 422
    assert client.get("/api/large/../../etc/tiles").status_code == 404
    assert client.get("/api/large/" + "z" * 32 + "/tiles").status_code == 404


def test_tiles_are_assembled_strip_by_strip_into_one_picture(client):
    def tile(w, h, rgb):
        b = io.BytesIO(); Image.new("RGB", (w, h), rgb).save(b, "PNG"); return b.getvalue()
    grid = [(0, 0, tile(300, 200, (255, 0, 0))), (300, 0, tile(100, 200, (0, 255, 0))), (0, 200, tile(300, 50, (0, 0, 255))), (300, 200, tile(100, 50, (255, 255, 0)))]
    import json as _json
    r = client.post("/api/large/assemble", data={"name": "joined", "width": 400, "height": 250, "places": _json.dumps([{"x": x, "y": y} for x, y, _ in grid])},
                    files=[("files", (f"{i}.png", d, "image/png")) for i, (_, _, d) in enumerate(grid)])
    assert r.status_code == 200, r.text
    out = client.get(r.json()["url"])
    im = Image.open(io.BytesIO(out.content)).convert("RGB")
    assert im.size == (400, 250) and [im.getpixel(p) for p in ((299, 199), (300, 199), (299, 200), (300, 200))] == [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    assert "attachment" in out.headers.get("content-disposition", "")
    gap = client.post("/api/large/assemble", data={"name": "gap", "width": 400, "height": 250, "places": _json.dumps([{"x": 0, "y": 0}, {"x": 0, "y": 200}])},
                      files=[("files", ("a.png", grid[0][2], "image/png")), ("files", ("b.png", grid[2][2], "image/png"))])
    assert gap.status_code == 422 and "cover" in gap.json()["detail"]
    assert client.get("/api/large/exports/..%2F..%2Fsecret").status_code == 404
