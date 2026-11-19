import os
import time

import pytest

from app.services import agent_lookup, agent_programs, claude_code
from tests.conftest import stand_in

pytestmark = pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
VERSION_FOLDERS = (".nvm/versions/node/v20.11.0/bin", ".nvm/versions/node/v22.3.0/bin", ".local/share/fnm/node-versions/v20.0.0/installation/bin",
                   "Library/Application Support/fnm/node-versions/v21.0.0/installation/bin", ".asdf/installs/nodejs/20.1.0/bin",
                   ".local/share/mise/installs/node/22.0.0/bin", ".local/share/cursor-agent/versions/2025.10.01-abc")
NODE_STYLE = '#!/usr/bin/env node\nif [ "$1" = "--version" ]; then echo "7.7.7 (node-style stand-in)"; exit 0; fi\necho "first on PATH: ${PATH%%:*}"\nread line\n'
STAND_IN_NODE = '#!/bin/sh\nscript="$1"; shift; exec /bin/sh "$script" "$@"\n'


def located(program, home, setting=""):
    return agent_lookup.check(agent_lookup.find(program, setting=setting, home=home))


@pytest.mark.parametrize("program", list(agent_lookup.PROGRAMS))
def test_started_from_the_dock_each_program_is_found_under_each_known_folder(dock_start, program):
    for folder in VERSION_FOLDERS:
        (dock_start / folder).mkdir(parents=True)
    places = agent_lookup.candidates(program, dock_start)
    assert len(places) >= 13 and all(dock_start in place.parents for place in places)
    for place in places:
        real = None
        if place.name == "agent" and "cursor" not in str(place):
            real = stand_in(dock_start / ".local/share/cursor-agent/versions/2025.10.01-abc/held")
            place.parent.mkdir(parents=True, exist_ok=True)
            place.symlink_to(real)
        else:
            stand_in(place)
        agent_lookup.forget()
        found = located(program, dock_start)
        assert (found.path, found.how, found.state, found.version) == (str(place), "folder", "runs", "9.9.9")
        place.unlink()
        if real:
            real.unlink()


def test_a_program_named_agent_that_is_not_cursors_is_not_taken(dock_start):
    stand_in(dock_start / ".local/bin/agent")
    assert agent_lookup.find("cursor", setting="", home=dock_start).state == "missing"


@pytest.mark.parametrize("program", list(agent_lookup.PROGRAMS))
def test_a_program_in_no_known_folder_is_found_through_the_shell_path_the_setting_or_the_override(dock_start, program, monkeypatch):
    place = stand_in(dock_start / "odd tools" / "bin" / agent_lookup.PROGRAMS[program]["names"][0])
    assert located(program, dock_start).state == "missing"
    (dock_start / ".shell-path").write_text(str(place.parent))
    agent_lookup.forget()
    found = located(program, dock_start)
    assert (found.path, found.how, found.state) == (str(place), "shell", "runs")
    (dock_start / ".shell-path").unlink()
    agent_lookup.forget()
    found = located(program, dock_start, setting=str(place))
    assert (found.how, found.state, found.looked) == ("setting", "runs", [])
    monkeypatch.setenv("FORMX_BIN", str(place))
    found = agent_lookup.find(program, setting="", override_vars=("FORMX_BIN",), home=dock_start)
    assert (found.how, found.looked) == ("override", ["your setting (empty)"])


def test_a_program_that_is_there_but_does_not_start_says_so_with_its_error_line(dock_start):
    place = stand_in(dock_start / ".local/bin/claude", "#!/usr/bin/env node-that-is-not-here\necho never\n")
    found = located("claude", dock_start)
    assert found.state == "broken" and found.path == str(place) and "node-that-is-not-here" in found.error
    said = agent_lookup.sentence(found, "INSTALL", "give its path in Preferences")
    assert said.startswith(f"Claude Code was found at {place} (a known install folder) but does not start: ") and said.endswith("To use another copy, give its path in Preferences.")
    assert agent_lookup.answer(found)["installed"] is False


def test_nothing_anywhere_is_not_found_with_the_places_it_looked(dock_start):
    for program, spec in agent_lookup.PROGRAMS.items():
        found = located(program, dock_start)
        assert (found.state, found.path, found.how) == ("missing", None, "")
        assert found.looked[0] == "your setting (empty)" and found.looked[1] == "PATH (/usr/bin:/bin:/usr/sbin:/sbin)"
        assert "~/.local/bin, ~/.npm-global/bin" in found.looked[2] and found.looked[3] == "your shell (zsh, login and interactive)"
        assert agent_lookup.sentence(found, "GET IT", "give its path in Preferences") == f"{spec['title']} was not found. Looked in: {'; '.join(found.looked)}. Install it with: GET IT, or give its path in Preferences."
    assert agent_lookup.find("claude", setting="/no/such/claude", home=dock_start).looked[0] == "your setting (/no/such/claude, which is not a program that can run)"


def test_the_child_path_puts_the_programs_own_folder_first_so_a_node_script_finds_the_node_beside_it(dock_start):
    place = stand_in(dock_start / ".nvm/versions/node/v22.3.0/bin/codex", NODE_STYLE)
    stand_in(place.parent / "node", STAND_IN_NODE)
    found = located("codex", dock_start)
    assert (found.state, found.version) == ("runs", "7.7.7")
    env = agent_lookup.child_env(found.path, base={"PATH": "/usr/bin:/bin", "CLAUDECODE": "1", "CLAUDE_CONFIG_DIR": "/kept", "LD_LIBRARY_PATH": "/frozen",
                                                   "LD_LIBRARY_PATH_ORIG": "/as-it-was", "HOME": str(dock_start), "SHELL": os.environ["SHELL"]}, front=["/app"], extra={"EXTRA": "1"})
    assert env["PATH"].split(os.pathsep)[:2] == [str(place.parent), "/app"] and "/usr/bin" in env["PATH"].split(os.pathsep)
    assert "CLAUDECODE" not in env and env["CLAUDE_CONFIG_DIR"] == "/kept" and env["LD_LIBRARY_PATH"] == "/as-it-was" and env["EXTRA"] == "1"


def test_a_start_goes_through_the_login_shell_and_on_windows_a_cmd_file_through_the_command_interpreter(dock_start):
    assert agent_lookup.start_argv(["/a b/claude", "--x", "it's"]) == [os.environ["SHELL"], "-l", "-c", "exec '/a b/claude' --x 'it'\"'\"'s'"]
    assert agent_lookup.start_argv(["C:\\npm\\codex.cmd", "--version"], {"COMSPEC": "C:\\Windows\\cmd.exe"}, "win32") == ["C:\\Windows\\cmd.exe", "/c", "C:\\npm\\codex.cmd", "--version"]
    assert agent_lookup.start_argv(["C:\\bin\\claude.exe"], {}, "win32") == ["C:\\bin\\claude.exe"]


def test_the_windows_search_for_antigravity_lists_folders_named_like_it_one_and_two_levels_down(dock_start):
    local = dock_start / "AppData" / "Local"
    for deep in ("Google Antigravity/agy.exe", "Programs/antigravity-cli/agy.exe", "agy/bin/agy.exe"):
        place = stand_in(local / deep)
        found = agent_lookup.find("antigravity", setting="", env={"PATH": "", "LOCALAPPDATA": str(local)}, home=dock_start, platform="win32")
        assert (found.path, found.how) == (str(place), "folder")
        place.unlink()
    names = [p.name for p in agent_lookup.candidates("codex", dock_start, {}, "win32")]
    assert names[:3] == ["codex.exe", "codex.cmd", "codex.bat"]


def test_a_program_is_added_to_the_table_without_changing_the_file(dock_start, monkeypatch):
    monkeypatch.setattr(agent_lookup, "PROGRAMS", dict(agent_lookup.PROGRAMS))
    agent_lookup.register("demo", "Demo Agent", ("demo-agent",), setting="demoBin", install="get demo", home=(".demo/bin",))
    stand_in(dock_start / ".demo/bin/demo-agent")
    found = located("demo", dock_start)
    assert (found.title, found.how, found.state) == ("Demo Agent", "folder", "runs") and agent_lookup.install("demo") == "get demo"


def test_the_status_route_reports_the_four_programs_with_how_each_was_found_and_where_it_looked(client, dock_start):
    stand_in(dock_start / ".local/bin/claude", '#!/bin/sh\nif [ "$1" = "auth" ]; then echo \'{"loggedIn": true}\'; exit 0; fi\necho "2.9.9 (stand-in)"\n')
    stand_in(dock_start / ".nvm/versions/node/v22.3.0/bin/codex")
    stand_in(dock_start / "odd" / "cursor-agent")
    (dock_start / ".shell-path").write_text(str(dock_start / "odd"))
    status = client.get("/api/claude-code/status?fresh=true").json()
    assert (status["installed"], status["finding"], status["how"], status["version"], status["signedIn"]) == (True, "runs", "folder", "2.9.9", True)
    chat = client.get("/api/agent/claude/status").json()
    assert (chat["finding"], chat["state"], chat["how"]) == ("runs", "idle", "folder")
    agents = status["agents"]
    assert (agents["codex"]["finding"], agents["codex"]["how"], agents["codex"]["version"], agents["codex"]["install"]) == ("runs", "folder", "9.9.9", "")
    assert (agents["cursor"]["finding"], agents["cursor"]["how"], agents["cursor"]["path"]) == ("runs", "shell", str(dock_start / "odd" / "cursor-agent"))
    missing = agents["antigravity"]
    assert (missing["installed"], missing["finding"], missing["path"], missing["title"]) == (False, "missing", None, "Antigravity")
    assert missing["looked"][0] == "PATH (/usr/bin:/bin:/usr/sbin:/sbin)" and missing["looked"][-1] == "your shell (zsh, login and interactive)"
    assert missing["said"].startswith("Antigravity was not found. Looked in: PATH (/usr/bin:/bin:/usr/sbin:/sbin); ~/.local/bin, ") and missing["install"] in missing["said"]


def test_a_tab_and_chat_start_a_node_style_program_with_its_own_folder_first_on_the_path(client, dock_start):
    from app.services import terminal

    place = stand_in(dock_start / ".nvm/versions/node/v22.3.0/bin/codex", NODE_STYLE)
    stand_in(place.parent / "node", STAND_IN_NODE)
    res = client.post("/api/terminal/agent", json={"kind": "codex", "cols": 80, "rows": 20})
    assert res.status_code == 200
    session = terminal.SESSIONS[res.json()["id"]]
    assert session.env["PATH"].split(os.pathsep)[0] == str(place.parent) and session.argv[:2] == [os.environ["SHELL"], "-l"]
    for _ in range(40):
        if "first on PATH" in session.scrollback():
            break
        time.sleep(0.1)
    assert f"first on PATH: {place.parent}" in session.scrollback()
    assert client.delete(f"/api/terminal/{session.id}").status_code == 200
    assert claude_code.child_env(str(place))["PATH"].split(os.pathsep)[0] == str(place.parent)


def test_opening_a_tab_for_a_missing_or_broken_program_answers_with_the_sentence(client, dock_start):
    res = client.post("/api/terminal/agent", json={"kind": "codex"})
    assert res.status_code == 404 and res.json()["detail"].startswith("Codex was not found. Looked in: PATH (/usr/bin:/bin:/usr/sbin:/sbin); ")
    stand_in(dock_start / ".local/bin/claude", "#!/usr/bin/env node-that-is-not-here\n")
    res = client.post("/api/terminal/claude", json={"fresh": True})
    assert res.status_code == 404 and " but does not start: " in res.json()["detail"]
    res = client.post("/api/agent/claude/start", json={"mode": "ask"})
    assert res.status_code == 409 and res.json()["detail"].startswith("Claude Code was found at ")
    assert client.post("/api/terminal/agent", json={"kind": "antigravity"}).status_code == 422
    assert set(agent_programs.PROGRAMS) == {"codex", "cursor", "antigravity"} and agent_programs.TABS == ("codex", "cursor")
