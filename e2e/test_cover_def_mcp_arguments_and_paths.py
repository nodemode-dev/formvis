# D31: a misspelled enum argument ('verticle') ran as horizontal; it is now refused with the allowed values.
# D32: agent file paths inside a system folder, or a link that leads into one, are refused.
import json
import os
import urllib.request

ENGINE = f"http://127.0.0.1:{os.environ.get('FORMVIS_E2E_ENGINE_PORT', '8190')}/mcp"


def call(name, arguments, ident=1):
    body = json.dumps({"jsonrpc": "2.0", "id": ident, "method": "tools/call", "params": {"name": name, "arguments": arguments}}).encode()
    req = urllib.request.Request(ENGINE, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def text(reply):
    return reply["result"]["content"][0]["text"]


def test_d31_a_misspelled_direction_is_refused_with_the_allowed_values():
    reply = call("flip_canvas", {"direction": "verticle"})
    assert reply["result"]["isError"] is True
    msg = text(reply)
    assert "was not run" in msg and "'verticle'" in msg and "horizontal, vertical" in msg


def test_d31_an_unknown_tool_is_a_protocol_error():
    assert call("no_such_tool_covdef", {})["error"]["code"] == -32602


def test_d32_system_folders_are_refused_for_reading_and_writing():
    for tool, path in (("open_file", "/etc/ssl/covdef.png"), ("export_image", "/usr/covdef.png")):
        reply = call(tool, {"path": path})
        assert reply["result"]["isError"] is True
        assert "system location" in text(reply), (tool, text(reply))


def test_d32_a_link_into_a_system_folder_is_refused(tmp_path):
    link = tmp_path / "covdef_link.png"
    link.symlink_to("/etc/covdef_target.png")
    reply = call("open_file", {"path": str(link)})
    assert reply["result"]["isError"] is True
    assert "system location (/etc)" in text(reply)
