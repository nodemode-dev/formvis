"""./formvis agents (1.53.3): the editing skill in step with the catalogue, the user-level install for Claude Code,
Codex and Cursor, and the repository's own configuration files."""

import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AGENTS = [sys.executable, str(ROOT / "setup" / "agents.py")]


def run(*args, home: Path | None = None):
    env = {**os.environ, **({"HOME": str(home), "PATH": "/usr/bin:/bin", "CODEX_HOME": str(home / ".codex")} if home else {})}
    return subprocess.run(AGENTS + list(args), capture_output=True, text=True, env=env, cwd=ROOT, timeout=120)


def test_the_skill_is_in_step_with_the_catalogue():
    r = run("sync", "--check")
    assert r.returncode == 0, r.stdout + r.stderr                    # a catalogue changed without ./formvis agents sync fails here


def test_install_keeps_what_is_there_is_idempotent_and_dry_runs(tmp_path):
    home = tmp_path / "home"
    (home / ".codex").mkdir(parents=True)
    (home / ".codex" / "config.toml").write_text('model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\n')
    (home / ".cursor").mkdir()
    (home / ".cursor" / "mcp.json").write_text(json.dumps({"mcpServers": {"other": {"command": "other"}}}))
    dry = run("install", "--dry-run", home=home)
    assert dry.returncode == 0 and "Would do" in dry.stdout
    assert not (home / ".claude").exists() and "formvis" not in (home / ".codex" / "config.toml").read_text()   # nothing written
    first = run("install", home=home)
    assert first.returncode == 0, first.stderr
    codex = tomllib.loads((home / ".codex" / "config.toml").read_text())
    assert codex["model"] == "gpt-5" and codex["mcp_servers"]["other"]["command"] == "other"                   # kept
    assert codex["mcp_servers"]["formvis"]["command"] == str(ROOT / "formvis") and codex["mcp_servers"]["formvis"]["args"] == ["mcp"]
    cursor = json.loads((home / ".cursor" / "mcp.json").read_text())
    assert cursor["mcpServers"]["other"] == {"command": "other"} and cursor["mcpServers"]["formvis"] == {"command": str(ROOT / "formvis"), "args": ["mcp"]}
    assert (home / ".claude" / "skills" / "formvis-editing" / "SKILL.md").exists() and (home / ".agents" / "skills" / "formvis-editing" / "references" / "tools.md").exists()
    assert "claude mcp add --scope user formvis -- " in first.stdout                                          # no claude command here: how to
    assert len(list((home / ".codex").glob("config.toml.bak-*"))) == 1 and len(list((home / ".cursor").glob("mcp.json.bak-*"))) == 1
    before = {p: p.read_bytes() for p in home.rglob("*") if p.is_file()}
    second = run("install", home=home)
    assert "already" in second.stdout and {p: p.read_bytes() for p in home.rglob("*") if p.is_file()} == before   # nothing changed
    assert run("install", "gemini", home=home).returncode == 2


def test_the_repositorys_configuration_launches_formvis_mcp():
    claude = json.loads((ROOT / ".mcp.json").read_text())["mcpServers"]["formvis"]
    assert claude["command"] == "${CLAUDE_PROJECT_DIR:-.}/formvis" and claude["args"] == ["mcp"]
    cursor = json.loads((ROOT / ".cursor" / "mcp.json").read_text())["mcpServers"]["formvis"]
    assert cursor["command"] == "${workspaceFolder}/formvis" and cursor["args"] == ["mcp"]
    codex = tomllib.loads((ROOT / ".codex" / "config.toml").read_text())["mcp_servers"]["formvis"]
    assert codex["command"] == "sh" and codex["args"][-1].endswith('/formvis" mcp') and codex["tool_timeout_sec"] >= 600
