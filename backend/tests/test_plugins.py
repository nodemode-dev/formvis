"""Plugins (1.52.6): the plugins folder's list, read, add and remove; names that could leave the folder refused."""

from app.core import config


def test_add_list_read_and_remove(client):
    assert client.put("/api/plugins/Invert Red.js", content=b"formvis.register({ name: 'x', commands: [] });").json() == {"name": "Invert Red.js", "size": 46}
    assert client.get("/api/plugins").json() == [{"name": "Invert Red.js", "size": 46}]
    r = client.get("/api/plugins/Invert Red.js")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/javascript") and "register" in r.text
    client.delete("/api/plugins/Invert Red.js")
    assert client.get("/api/plugins").json() == [] and client.get("/api/plugins/Invert Red.js").status_code == 404


def test_names_that_could_leave_the_folder_and_bad_files_are_refused(client):
    for bad in ("../evil.js", "..%2Fevil.js", "evil.py", ".hidden.js", "a/b.js", "x" * 70 + ".js"):
        assert client.put(f"/api/plugins/{bad}", content=b"1").status_code >= 400, bad   # refused, by the route or before it
    assert client.get("/api/plugins").json() == [] and not any((config.data_dir()).rglob("evil*"))            # nothing written anywhere
    assert client.put("/api/plugins/empty.js", content=b"   ").status_code == 422
    assert client.put("/api/plugins/big.js", content=b"x" * (512 * 1024 + 1)).status_code == 422
    assert client.put("/api/plugins/binary.js", content=b"\xff\xfe\x00").status_code == 422
