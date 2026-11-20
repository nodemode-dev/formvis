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


def run(*args, home: Path | None = None, claude: Path | None = None):
    env = {**os.environ, **({"HOME": str(home), "PATH": "/usr/bin:/bin", "CODEX_HOME": str(home / ".codex"), "FORMVIS_CLAUDE_BIN": str(claude or "")} if home else {})}
    return subprocess.run(AGENTS + list(args), capture_output=True, text=True, env=env, cwd=ROOT, timeout=120)


def test_the_skill_is_in_step_with_the_catalogue():
    r = run("sync", "--check")
    assert r.returncode == 0, r.stdout + r.stderr                    # a catalogue changed without ./formvis agents sync fails here


def test_the_agent_manifest_is_what_sync_writes():
    r = run("sync", "--check")
    assert r.returncode == 0 and "agents/manifest.json" not in r.stdout, r.stdout + r.stderr
    data = json.loads((ROOT / "agents" / "manifest.json").read_text(encoding="utf-8"))
    mcp = data["mcp"]
    assert data["format"] == "form-agent-manifest" and data["version"] == 1 and data["app"] == "formvis"
    assert len(mcp["tools"]) == len(set(mcp["tools"])) and set(mcp["read_only"]) <= set(mcp["tools"]) and set(mcp["approval_gated"]) <= set(mcp["tools"])
    assert not set(mcp["read_only"]) & set(mcp["approval_gated"])
    assert [s["name"] for s in data["skills"]] == sorted(p.name for p in (ROOT / ".claude" / "skills").iterdir() if (p / "SKILL.md").is_file())


def test_install_keeps_what_is_there_is_idempotent_and_dry_runs(tmp_path):
    home = tmp_path / "home"
    (home / ".codex").mkdir(parents=True)
    (home / ".codex" / "config.toml").write_text('model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\n')
    (home / ".cursor").mkdir()
    (home / ".cursor" / "mcp.json").write_text(json.dumps({"mcpServers": {"other": {"command": "other"}}}))
    calls = tmp_path / "calls.txt"
    claude = tmp_path / "claude"   # a stand-in found through FORMVIS_CLAUDE_BIN, so no claude of this computer is ever started
    claude.write_text(f'#!/bin/sh\necho "$@" >> "{calls}"\nif [ "$1" = "--version" ]; then echo "9.9.9 (stand-in)"; exit 0; fi\nif [ "$1 $2" = "mcp get" ]; then exit 1; fi\nexit 0\n')
    claude.chmod(0o755)
    dry = run("install", "--dry-run", home=home, claude=claude)
    assert dry.returncode == 0 and "Would do" in dry.stdout
    assert not (home / ".claude").exists() and "formvis" not in (home / ".codex" / "config.toml").read_text()   # nothing written
    if os.name != "nt":
        assert calls.read_text().splitlines() == ["--version", "mcp get formvis"]                                # asked, nothing added
    first = run("install", home=home, claude=claude)
    assert first.returncode == 0, first.stderr
    if os.name != "nt":
        assert calls.read_text().splitlines()[-1] == f"mcp add --scope user formvis -- {ROOT / 'formvis'} mcp"     # the found program was started, through the finder
    codex = tomllib.loads((home / ".codex" / "config.toml").read_text())
    assert codex["model"] == "gpt-5" and codex["mcp_servers"]["other"]["command"] == "other"                   # kept
    assert codex["mcp_servers"]["formvis"]["command"] == str(ROOT / "formvis") and codex["mcp_servers"]["formvis"]["args"] == ["mcp"]
    cursor = json.loads((home / ".cursor" / "mcp.json").read_text())
    assert cursor["mcpServers"]["other"] == {"command": "other"} and cursor["mcpServers"]["formvis"] == {"command": str(ROOT / "formvis"), "args": ["mcp"]}
    assert (home / ".claude" / "skills" / "formvis-editing" / "SKILL.md").exists() and (home / ".agents" / "skills" / "formvis-editing" / "references" / "tools.md").exists()
    assert "claude mcp add --scope user formvis -- " in first.stdout
    assert len(list((home / ".codex").glob("config.toml.bak-*"))) == 1 and len(list((home / ".cursor").glob("mcp.json.bak-*"))) == 1
    before = {p: p.read_bytes() for p in home.rglob("*") if p.is_file()}
    second = run("install", home=home, claude=claude)
    assert "already" in second.stdout and {p: p.read_bytes() for p in home.rglob("*") if p.is_file()} == before   # nothing changed
    assert run("install", "gemini", home=home).returncode == 2


def test_install_adds_formvis_to_antigravity_keeps_the_rest_and_leaves_a_foreign_entry_alone(tmp_path):
    home = tmp_path / "home"
    cfg = home / ".gemini" / "config" / "mcp_config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"mcpServers": {"other": {"serverUrl": "https://example.test/mcp"}}, "theme": "dark"}))
    ours = {"command": str(ROOT / "formvis"), "args": ["mcp"]}
    assert "Would do" in run("install", "--dry-run", "antigravity", home=home).stdout and "formvis" not in cfg.read_text()
    assert run("install", "antigravity", home=home).returncode == 0
    assert json.loads(cfg.read_text()) == {"mcpServers": {"other": {"serverUrl": "https://example.test/mcp"}, "formvis": ours}, "theme": "dark"}
    before = {p: p.read_bytes() for p in home.rglob("*") if p.is_file()}
    assert "already" in run("install", "antigravity", home=home).stdout and {p: p.read_bytes() for p in home.rglob("*") if p.is_file()} == before
    cfg.write_text(json.dumps({"mcpServers": {"formvis": {"command": "/an/older/place/formvis", "args": ["mcp"]}}}))
    run("install", "antigravity", home=home)
    assert json.loads(cfg.read_text())["mcpServers"]["formvis"] == ours                                           # its own entry, brought up to date
    foreign = json.dumps({"mcpServers": {"formvis": {"serverUrl": "https://someone.test/mcp"}}})
    cfg.write_text(foreign)
    assert "did not write" in run("install", "antigravity", home=home).stdout and cfg.read_text() == foreign
    cfg.write_text("not json")
    assert "left alone" in run("install", "antigravity", home=home).stdout and cfg.read_text() == "not json"


def test_install_writes_the_documented_antigravity_file_when_only_the_older_one_is_there(tmp_path):
    home = tmp_path / "home"
    older = home / ".gemini" / "antigravity-cli" / "mcp_config.json"
    older.parent.mkdir(parents=True)
    older.write_text('{"mcpServers": {"old": {"command": "old"}}}')
    said = run("install", "antigravity", home=home).stdout
    assert "an older file was seen" in said and older.read_text() == '{"mcpServers": {"old": {"command": "old"}}}'
    assert json.loads((home / ".gemini" / "config" / "mcp_config.json").read_text())["mcpServers"]["formvis"] == {"command": str(ROOT / "formvis"), "args": ["mcp"]}


def test_the_repositorys_configuration_launches_formvis_mcp():
    claude = json.loads((ROOT / ".mcp.json").read_text())["mcpServers"]["formvis"]
    assert claude["command"] == "${CLAUDE_PROJECT_DIR:-.}/formvis" and claude["args"] == ["mcp"]
    cursor = json.loads((ROOT / ".cursor" / "mcp.json").read_text())["mcpServers"]["formvis"]
    assert cursor["command"] == "${workspaceFolder}/formvis" and cursor["args"] == ["mcp"]
    codex = tomllib.loads((ROOT / ".codex" / "config.toml").read_text())["mcp_servers"]["formvis"]
    assert codex["command"] == "sh" and codex["args"][-1].endswith('/formvis" mcp') and codex["tool_timeout_sec"] >= 600
