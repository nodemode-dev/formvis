import io
import os
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FORMVIS_DATA_DIR", str(tmp_path))
    from app.main import app

    with TestClient(app, base_url="http://127.0.0.1:8190") as c:
        yield c


def need_model(model: str, download: bool = False) -> None:
    from app.localgen import jobs, model_manager

    if model_manager.ready(model):
        return
    if not (download and os.environ.get("FORMVIS_TEST_DOWNLOAD_MODELS") == "1"):
        pytest.skip(f"needs the {model} model in the data folder; set FORMVIS_TEST_DOWNLOAD_MODELS=1 to fetch it (network)")
    job = model_manager.start_download(model)
    state = {}
    for _ in range(1200):
        state = jobs.status(job["job_id"])
        if state["status"] in ("done", "error", "failed"):
            break
        time.sleep(0.25)
    if not model_manager.ready(model):
        pytest.skip(f"the {model} model could not be downloaded: {state.get('status')}")


def png_bytes(size=(8, 6), color=(200, 100, 50, 255)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG")
    return buf.getvalue()


def manifest(width=8, height=6, layers=None) -> dict:
    return {"format": "com.nodemode.formvis", "version": 1, "width": width, "height": height, "layers": layers or []}
