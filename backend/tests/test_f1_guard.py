import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

ENGINE_PORT = 8190
WINDOW_PORT = 5190
HEALTH_PATH = "/api/health"
WS_PATH = "/api/agents/stream"
OWN = f"http://127.0.0.1:{ENGINE_PORT}"
LOOPBACK_HOST = f"127.0.0.1:{ENGINE_PORT}"
WINDOW_ORIGINS = [
    f"http://localhost:{WINDOW_PORT}",
    f"http://127.0.0.1:{WINDOW_PORT}",
    f"http://localhost:{WINDOW_PORT + 1}",
    f"http://127.0.0.1:{WINDOW_PORT + 1}",
    "tauri://localhost",
    "http://tauri.localhost",
]
FOREIGN_ORIGINS = [
    "http://evil.example",
    "https://evil.example",
    f"http://localhost.evil.com:{ENGINE_PORT}",
    f"http://127.0.0.1.evil.com:{ENGINE_PORT}",
    "http://localhost:3099",
    "http://127.0.0.1:3099",
    "null",
    "file://",
]
FOREIGN_HOSTS = ["evil.example", f"evil.example:{ENGINE_PORT}", f"localhost.evil.com:{ENGINE_PORT}", f"192.168.1.10:{ENGINE_PORT}"]


@pytest.fixture(scope="module")
def guard(tmp_path_factory):
    patch = pytest.MonkeyPatch()
    patch.setenv("FORMVIS_DATA_DIR", str(tmp_path_factory.mktemp("guard")))
    from app.main import app

    with TestClient(app, base_url=OWN) as c:
        yield c
    patch.undo()


def test_foreign_origins_are_not_in_the_apps_own_list():
    from app.core import config

    assert not set(FOREIGN_ORIGINS) & set(config.window_origins())
    assert set(WINDOW_ORIGINS) <= set(config.window_origins())


@pytest.mark.parametrize("host", FOREIGN_HOSTS)
def test_foreign_host_is_refused(guard, host):
    assert guard.get(HEALTH_PATH, headers={"host": host}).status_code == 403


@pytest.mark.parametrize("origin", FOREIGN_ORIGINS)
def test_foreign_origin_is_refused(guard, origin):
    assert guard.get(HEALTH_PATH, headers={"origin": origin}).status_code == 403


@pytest.mark.parametrize("origin", FOREIGN_ORIGINS)
def test_foreign_origin_cannot_post(guard, origin):
    assert guard.post(HEALTH_PATH, headers={"origin": origin}).status_code == 403


def test_foreign_host_with_an_allowed_origin_is_refused(guard):
    assert guard.get(HEALTH_PATH, headers={"host": "evil.example", "origin": WINDOW_ORIGINS[0]}).status_code == 403


def test_cross_site_request_without_origin_is_refused(guard):
    assert guard.get(HEALTH_PATH, headers={"sec-fetch-site": "cross-site"}).status_code == 403


@pytest.mark.parametrize("value", ["CROSS-SITE", " cross-site "])
def test_cross_site_marker_is_read_loosely(guard, value):
    assert guard.get(HEALTH_PATH, headers={"sec-fetch-site": value}).status_code == 403


@pytest.mark.parametrize("origin", [OWN, *WINDOW_ORIGINS])
def test_allowed_origin_passes(guard, origin):
    assert guard.get(HEALTH_PATH, headers={"origin": origin}).status_code == 200


@pytest.mark.parametrize("host", [f"localhost:{ENGINE_PORT}", f"[::1]:{ENGINE_PORT}"])
def test_own_origin_under_another_loopback_name_passes(guard, host):
    assert guard.get(HEALTH_PATH, headers={"host": host, "origin": f"http://{host}"}).status_code == 200


def test_own_origin_must_match_the_host_it_was_sent_to(guard):
    assert guard.get(HEALTH_PATH, headers={"host": LOOPBACK_HOST, "origin": f"http://127.0.0.1:{ENGINE_PORT + 1}"}).status_code == 403


@pytest.mark.parametrize("site", ["same-origin", "same-site", "none"])
def test_browser_request_without_origin_passes_unless_cross_site(guard, site):
    assert guard.get(HEALTH_PATH, headers={"sec-fetch-site": site}).status_code == 200


def test_plain_client_without_origin_passes(guard):
    assert guard.get(HEALTH_PATH).status_code == 200


@pytest.mark.parametrize("host", [LOOPBACK_HOST, f"localhost:{ENGINE_PORT}", f"[::1]:{ENGINE_PORT}"])
def test_loopback_hosts_pass(guard, host):
    assert guard.get(HEALTH_PATH, headers={"host": host}).status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        {"host": "evil.example"},
        {"host": LOOPBACK_HOST, "origin": "http://evil.example"},
        {"host": LOOPBACK_HOST, "origin": "null"},
        {"host": LOOPBACK_HOST, "origin": f"http://localhost.evil.com:{ENGINE_PORT}"},
    ],
)
def test_foreign_websocket_closes_4403(guard, headers):
    with pytest.raises(WebSocketDisconnect) as refused:
        with guard.websocket_connect(WS_PATH, headers=headers) as ws:
            ws.receive()
    assert refused.value.code == 4403


@pytest.mark.parametrize("headers", [{"host": LOOPBACK_HOST}, {"host": LOOPBACK_HOST, "origin": OWN}, {"host": LOOPBACK_HOST, "origin": WINDOW_ORIGINS[0]}])
def test_own_websocket_opens(guard, headers):
    with guard.websocket_connect(WS_PATH, headers=headers) as ws:
        assert ws.receive_json()["type"] == "state"
