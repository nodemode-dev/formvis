from app.services import background, compute

CPU = "CPUExecutionProvider"
CUDA = "CUDAExecutionProvider"
COREML = "CoreMLExecutionProvider"


def test_automatic_prefers_cuda_then_metal_then_the_cpu():
    assert compute.choose("auto", [CUDA, COREML, CPU])["device"] == "cuda"
    assert compute.choose("auto", [COREML, CPU])["device"] == "metal"
    r = compute.choose("auto", [CPU])
    assert r["device"] == "cpu" and "no CUDA or Core ML" in r["reason"]


def test_the_cpu_is_always_the_last_provider():
    assert compute.choose("auto", [CUDA, CPU])["providers"] == [CUDA, CPU]
    assert compute.choose("metal", [COREML, CPU])["providers"] == [COREML, CPU]
    assert compute.choose("cpu", [CUDA, CPU])["providers"] == [CPU]


def test_a_chosen_device_that_is_missing_falls_back_to_the_cpu_and_says_why():
    r = compute.choose("cuda", [COREML, CPU])
    assert r["device"] == "cpu" and r["providers"] == [CPU]
    assert "CUDA is chosen, but ONNX Runtime here has no CUDAExecutionProvider" in r["reason"]


def test_the_routes_report_and_set_the_device(client):
    r = client.get("/api/compute").json()
    assert r["preference"] == "auto" and r["device"] in ("cpu", "cuda", "metal")
    assert client.get("/api/capabilities").json()["compute"]["device"] == r["device"]
    try:
        r = client.post("/api/compute", json={"device": "cpu"}).json()
        assert r["preference"] == "cpu" and r["device"] == "cpu" and r["providers"] == [CPU]
        assert client.post("/api/compute", json={"device": "quantum"}).status_code == 400
    finally:
        client.post("/api/compute", json={"device": "auto"})


def test_changing_the_device_drops_cached_model_sessions(monkeypatch):
    cleared = []
    monkeypatch.setattr(background, "clear_sessions", lambda: cleared.append(True))
    try:
        compute.set_preference("cpu")
        compute.set_preference("cpu")          # unchanged: nothing to drop
        assert cleared == [True]
    finally:
        compute.set_preference("auto")
