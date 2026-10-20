"""Tests against the real Linux desktop app: the Tauri 2 shell in src-tauri, its WebKitGTK window, on a private Xvfb display.

Build the debug binary once, without bundling (the shell then needs no frozen engine; the tests start engine_stub.py in its place):

    cd frontend && npx vite build
    cd src-tauri && TAURI_CONFIG='{"build":{"frontendDist":"../frontend/dist","beforeBuildCommand":""},"bundle":{"externalBin":[],"active":false}}' cargo build --locked

FORMVIS_DESKTOP_BIN names another binary, FORMVIS_DESKTOP_DIST another built frontend, FORMVIS_E2E_ENGINE_PORT another engine port.
Without the binary, Xvfb, the built frontend or a running engine, every test here is skipped with the reason.
"""
import pytest

from e2e.desktop import support


@pytest.fixture(scope="session")
def xserver():
    reason = support.skip_reason()
    if reason:
        pytest.skip(reason)
    server = support.XServer()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def shots(tmp_path_factory):
    return tmp_path_factory.mktemp("desktop-shots")


@pytest.fixture(scope="module")
def desktop(xserver, tmp_path_factory):
    app = support.Desktop(xserver, tmp_path_factory.mktemp("desktop"))
    app.launch()
    yield app
    app.stop()


@pytest.fixture()
def fresh(xserver, tmp_path_factory):
    """A shell the test starts itself (arguments, restarts); stopped afterwards."""
    app = support.Desktop(xserver, tmp_path_factory.mktemp("desktop"))
    yield app
    app.stop()
