"""Carrying data across the rename (1.50.5): the former name is read from app.core.legacy, never spelled here."""

import json

from app.core import config, legacy
from app.services import project_format
from tests.conftest import manifest, png_bytes


def _layers():
    return [{"id": "L1", "name": "Layer", "image": "L1.png", "visible": True, "opacity": 1, "blend": "normal", "x": 0, "y": 0, "width": 4, "height": 4}]


def test_a_project_saved_under_a_former_extension_lists_opens_and_is_replaced_by_fmv(client):
    r = client.post("/api/projects/save", data={"name": "Trip", "manifest": json.dumps(manifest(layers=_layers()))}, files=[("files", ("L1.png", png_bytes(), "image/png"))])
    assert r.status_code == 200
    lib = config.projects_dir()
    for ext in legacy.PROJECT_EXTENSIONS:
        (lib / "Trip.fmv").rename(lib / f"Trip{ext}")                                    # as saved before the rename
        assert [p["name"] for p in client.get("/api/projects").json()] == ["Trip"]
        assert client.get("/api/projects/library/Trip").json()["manifest"]["layers"][0]["id"] == "L1"
        client.post("/api/projects/save", data={"name": "Trip", "manifest": json.dumps(manifest(layers=_layers()))}, files=[("files", ("L1.png", png_bytes(), "image/png"))])
        assert (lib / "Trip.fmv").is_file() and not (lib / f"Trip{ext}").exists()        # saved as .fmv in its place
    client.delete("/api/projects/library/Trip")


def test_the_former_format_is_read():
    m = manifest(layers=_layers())
    m["format"] = legacy.FORMAT
    project_format.validate(m, {"images/L1.png", "L1.png"})                              # no error


def test_the_library_folder_moves_across_once(tmp_path):
    old = tmp_path / legacy.FORMER.capitalize()
    (old / "Projects").mkdir(parents=True)
    (old / "Projects" / "a.fmv").write_bytes(b"x")
    new = tmp_path / "Formvis"
    legacy.carry_over_library(new)
    assert (new / "Projects" / "a.fmv").read_bytes() == b"x" and not old.exists()
    old.mkdir()                                                                          # a second former folder later
    legacy.carry_over_library(new)
    assert old.exists() and (new / "Projects" / "a.fmv").exists()                        # the new one is never replaced
