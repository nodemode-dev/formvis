import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SONNY_DATA_DIR", str(tmp_path))
    from app.main import app

    with TestClient(app) as c:
        yield c


def png_bytes(size=(8, 6), color=(200, 100, 50, 255)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG")
    return buf.getvalue()


def manifest(width=8, height=6, layers=None) -> dict:
    return {"format": "com.nodemode.sonny", "version": 1, "width": width, "height": height, "layers": layers or []}
