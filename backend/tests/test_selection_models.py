"""Select Subject and Object Selection run the recommended model (BiRefNet, SAM 2.1 base-plus) once it is downloaded and
chosen, and the small one (U2-Net, SAM 2.1 tiny) otherwise; the choice is kept, and each model is pinned."""

import io
from urllib.parse import urlparse

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.localgen import model_manager
from app.main import app
from app.services import background, segment, selection_models

RECOMMENDED = {"subject": "birefnet-swin-t", "object": "sam2-base-plus-onnx"}
SMALL = {"subject": "u2net-onnx", "object": "sam2-onnx"}


@pytest.fixture()
def data(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "data_dir", lambda: tmp_path)
    return tmp_path


def _ready(*models):
    return lambda model: model in models


def client():
    return TestClient(app, base_url="http://127.0.0.1:8190")


@pytest.mark.parametrize("kind", ["subject", "object"])
def test_the_small_model_runs_until_the_recommended_one_is_downloaded(data, monkeypatch, kind):
    monkeypatch.setattr(model_manager, "ready", _ready())
    assert selection_models.preferences()[kind] == "recommended"
    assert selection_models.active(kind) == SMALL[kind]
    monkeypatch.setattr(model_manager, "ready", _ready(RECOMMENDED[kind]))
    assert selection_models.active(kind) == RECOMMENDED[kind]


@pytest.mark.parametrize("kind", ["subject", "object"])
def test_choosing_the_small_model_keeps_it_even_with_the_recommended_one_here(data, monkeypatch, kind):
    monkeypatch.setattr(model_manager, "ready", _ready(RECOMMENDED[kind]))
    r = client().put("/api/selection-models", json={"kind": kind, "choice": "small"})
    assert r.status_code == 200 and r.json()[kind]["choice"] == "small" and r.json()[kind]["active"] == SMALL[kind]
    assert selection_models.preferences()[kind] == "small" and (data / "selection_models.json").is_file()


def test_the_report_offers_the_recommended_model_first_with_its_size(data, monkeypatch):
    monkeypatch.setattr(model_manager, "ready", _ready())
    got = client().get("/api/selection-models").json()
    for kind in ("subject", "object"):
        options = got[kind]["options"]
        assert [o["role"] for o in options] == ["recommended", "small"]
        assert [o["id"] for o in options] == [RECOMMENDED[kind], SMALL[kind]]
        assert all(o["size"] and not o["ready"] for o in options)
    assert got["subject"]["options"][0]["license"] == "MIT" and got["object"]["options"][0]["license"] == "Apache-2.0"


@pytest.mark.parametrize("body", [{"kind": "subject", "choice": "large"}, {"kind": "people", "choice": "small"}])
def test_a_choice_outside_the_two_is_refused(data, body):
    assert client().put("/api/selection-models", json=body).status_code == 422


def test_an_unreadable_choice_file_falls_back_to_the_defaults(data):
    (data / "selection_models.json").write_text("{not json", encoding="utf-8")
    assert selection_models.preferences() == selection_models.DEFAULTS


@pytest.mark.parametrize("model", ["birefnet-swin-t", "sam2-base-plus-onnx"])
def test_the_recommended_models_are_pinned_official_downloads(model):
    spec = model_manager.MODELS[model]
    for name, url in spec["files"].items():
        assert len(model_manager.PINNED[name]) == 64 and int(model_manager.PINNED[name], 16) >= 0
        assert urlparse(url).scheme == "https"
    hosts = {urlparse(u).path.split("/")[1] for u in spec["files"].values()}
    assert hosts == ({"ZhengPeng7"} if model == "birefnet-swin-t" else {"onnx-community"})


def test_birefnet_is_the_swin_t_file_formlit_uses():
    (name, url), = model_manager.MODELS["birefnet-swin-t"]["files"].items()
    assert url == "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx"
    assert model_manager.PINNED[name] == "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333"
    assert model_manager.MODELS["birefnet-swin-t"]["size"] == "224 MB" and "birefnet-general" not in model_manager.MODELS


def test_select_subject_runs_birefnet_once_it_is_the_active_model(data, monkeypatch):
    seen = []
    monkeypatch.setattr(model_manager, "ready", _ready("birefnet-swin-t"))
    monkeypatch.setattr(background, "_birefnet", lambda image: seen.append("birefnet") or Image.new("L", image.size, 200))
    monkeypatch.setattr(background, "_u2net_onnx", lambda image: seen.append("u2net") or Image.new("L", image.size, 10))
    monkeypatch.setattr(background, "_has", lambda module: module == "onnxruntime")
    assert np.asarray(background._ml(Image.new("RGB", (8, 6)))).max() == 200 and seen == ["birefnet"]
    selection_models.set_preference("subject", "small")
    assert np.asarray(background._ml(Image.new("RGB", (8, 6)))).max() == 10 and seen == ["birefnet", "u2net"]


def test_birefnet_reads_its_matte_like_a_matting_file():
    class Session:
        def run(self, _outputs, feeds):
            x = feeds["input_image"]
            assert x.shape == (1, 3, 1024, 1024) and x.dtype == np.float32
            return [np.full((1, 1, 1024, 1024), 4.0, np.float32)]   # logits: read through a sigmoid
    out = background._matte(Session(), "input_image", [1, 3, 1024, 1024], Image.new("RGB", (40, 30), (90, 90, 90)), "BiRefNet")
    assert out.size == (40, 30) and np.asarray(out).min() >= 250


def test_birefnet_runs_on_the_cpu_only_whatever_device_is_chosen(monkeypatch, tmp_path):
    import onnxruntime as ort

    seen = {}

    class Session:
        def __init__(self, path, options, providers):
            seen["providers"] = providers
    monkeypatch.setattr(ort, "InferenceSession", Session)
    background._birefnet_session(tmp_path / "m.onnx")
    assert seen["providers"] == ["CPUExecutionProvider"]


def test_an_object_encoded_with_one_model_is_encoded_again_after_the_switch(data, monkeypatch):
    monkeypatch.setattr(segment, "backend", lambda: "onnx")
    monkeypatch.setattr(segment, "available", lambda: True)
    monkeypatch.setattr(segment, "_onnx_encode", lambda rgb: {"image_embeddings.0": np.zeros(1)})
    monkeypatch.setattr(segment, "_onnx_select", lambda entry, points, box: np.ones(entry["size"][::-1], bool))
    monkeypatch.setattr(model_manager, "ready", _ready())
    b = io.BytesIO(); Image.new("RGB", (8, 6)).save(b, "PNG")
    segment.encode("k", b.getvalue())
    assert segment.select("k", [(2.0, 2.0, 1)])
    monkeypatch.setattr(model_manager, "ready", _ready("sam2-base-plus-onnx"))
    assert segment.onnx_model() == "sam2-base-plus-onnx"
    with pytest.raises(KeyError):
        segment.select("k", [(2.0, 2.0, 1)])
    assert not segment.has("k")
