import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from PIL import Image

REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[1]))
META = {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": "covcli-win", "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}
ENV = {**os.environ, "FORMVIS_URL": "http://127.0.0.1:8190"}


def tool(name, /, **args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"_meta": META, "name": name, "arguments": args}}).encode()
    req = urllib.request.Request("http://127.0.0.1:8190/mcp", body, {"Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["result"]


def policy(p):
    urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/agents/policy", json.dumps({"client": "covcli-win", "policy": p}).encode(), {"Content-Type": "application/json"}), timeout=10)


@pytest.fixture()
def agent(page):
    policy("allow")
    page.evaluate("() => { localStorage.setItem('formvis.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('formvis.prefs') || '{}'), agentsAllowed: true })); window.dispatchEvent(new CustomEvent('formvis:agents', { detail: true })); }")
    for _ in range(60):
        try:
            if tool("ping")["structuredContent"].get("allowed"):
                break
        except Exception:
            pass
        time.sleep(0.5)
    yield page
    policy("ask")


def cli(page, *args):
    proc = subprocess.Popen([str(REPO / "formvis"), "cli", *args], env=ENV, cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    start = time.time()
    while proc.poll() is None and time.time() - start < 90:
        page.wait_for_timeout(300)
    if proc.poll() is None:
        proc.kill()
    return proc.returncode, proc.stdout.read()


def pixel(page, x, y):
    return page.evaluate(f"Array.from(window.formvis.engine.flattened().getContext('2d').getImageData({x}, {y}, 1, 1).data)")


def test_cli_run_describes_and_runs_a_command_in_the_open_window(agent):
    tool("new_document", width=20, height=10, background="white", name="cliA")
    assert pixel(agent, 2, 2)[:3] == [255, 255, 255]
    code, out = cli(agent, "describe", "invert")
    assert code == 0 and "invert  (command, Image)" in out and "Inverts the colors of the active layer." in out and "keys: Mod+I" in out
    code, out = cli(agent, "run", "invert")
    assert code == 0 and out.startswith("Ran Invert.")
    assert pixel(agent, 2, 2)[:3] == [0, 0, 0]
    code, out = cli(agent, "list", "invert")
    assert code == 0 and any(line.startswith("invert ") and "Invert" in line for line in out.splitlines())


def test_cli_process_runs_commands_or_a_named_action_over_files(agent, tmp_path):
    Image.new("RGB", (20, 10), (255, 0, 0)).save(tmp_path / "r.png")
    tool("new_document", width=20, height=10, background="white", name="cliB")
    code, out = cli(agent, "process", str(tmp_path / "r.png"), "--run", "invert", "--out", str(tmp_path / "o1"), "--yes")
    assert code == 0 and "r.png ->" in out
    assert Image.open(tmp_path / "o1" / "r.png").convert("RGB").getpixel((2, 2)) == (0, 255, 255)
    code, out = cli(agent, "process", str(tmp_path / "r.png"), "--run", "invert", "--format", "jpg", "--suffix", "_x", "--out", str(tmp_path / "o2"), "--yes")
    assert code == 0 and (tmp_path / "o2" / "r_x.jpg").exists() and Image.open(tmp_path / "o2" / "r_x.jpg").format == "JPEG"
    agent.evaluate("window.formvis.commands.run('panel-actions')")
    agent.wait_for_selector(".cv-actions-panel .cv-actions-name", timeout=10000)
    agent.fill(".cv-actions-panel .cv-actions-name", "CovInv")
    agent.click(".cv-actions-panel [data-act=record]")
    agent.evaluate("window.formvis.commands.run('invert')")
    agent.wait_for_timeout(500)
    agent.click(".cv-actions-panel [data-act=stop]")
    agent.wait_for_timeout(500)
    code, out = cli(agent, "process", str(tmp_path / "r.png"), "--action", "CovInv", "--out", str(tmp_path / "o3"), "--yes")
    assert code == 0 and Image.open(tmp_path / "o3" / "r.png").convert("RGB").getpixel((2, 2)) == (0, 255, 255)
    drop = tmp_path / "c.fvdrop"
    code, out = cli(agent, "droplet", "CovInv", "--format", "png", "--to", str(tmp_path / "o4"), "--suffix", "_d", "--recursive", "--data", str(drop), "--out", str(tmp_path), "--name", "dd")
    assert code == 0 and drop.exists()
    (tmp_path / "in" / "sub").mkdir(parents=True)
    Image.new("RGB", (20, 10), (0, 0, 255)).save(tmp_path / "in" / "b.png")
    Image.new("RGB", (20, 10), (0, 255, 0)).save(tmp_path / "in" / "sub" / "g.png")
    code, out = cli(agent, "droplet", str(drop), str(tmp_path / "in"))
    assert code == 0, out
    assert sorted(p.name for p in (tmp_path / "o4").iterdir()) == ["b_d.png", "g_d.png"]
    assert Image.open(tmp_path / "o4" / "b_d.png").convert("RGB").getpixel((2, 2)) == (255, 255, 0)
    assert Image.open(tmp_path / "o4" / "g_d.png").convert("RGB").getpixel((2, 2)) == (255, 0, 255)
