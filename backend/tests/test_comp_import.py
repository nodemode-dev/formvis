import io
import json
import zipfile

from tests.conftest import png_bytes

# A .comp project names itself with a reverse-DNS id ending in ".project"; the importer goes by that shape, so these
# tests use an example label of it.
LABEL = "com.example.project"


def _comp(version=7, fmt=LABEL, layers=None, images=("A.png",), folder_root=None):
    m = {"format": fmt, "version": version, "colorSpace": "sRGB", "resolution": 72, "documentID": "D0C", "width": 8, "height": 6,
         "layers": layers if layers is not None else [
             {"id": "F", "name": "Folder", "isVisible": True, "isGroup": True},
             {"id": "A", "name": "Base", "isVisible": True, "imageFile": "A.png", "parentID": "F", "blendMode": "Multiply", "opacity": 0.5},
             {"id": "B", "name": "Clipped", "isVisible": False, "imageFile": "A.png", "maskSourceID": "A"}],
         "activeLayerID": "A"}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        prefix = f"{folder_root}/" if folder_root else ""
        z.writestr(f"{prefix}manifest.json", json.dumps(m))
        for name in images:
            z.writestr(f"{prefix}images/{name}", png_bytes())
    return buf.getvalue(), m


def _post(client, name, data):
    return client.post("/api/projects/import", files=[("files", (name, data, "application/zip"))])


def test_a_comp_project_opens_with_its_layers(client):
    data, _ = _comp()
    for name, expected in [("Old Work.comp", "Old Work"), ("Old Work.comp.zip", "Old Work")]:
        r = _post(client, name, data)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == expected                                  # .comp (and .zip) stripped from the name
        layers = {l["id"]: l for l in body["manifest"]["layers"]}
        assert layers["A"]["blendMode"] == "Multiply" and layers["A"]["parentID"] == "F" and layers["B"]["maskSourceID"] == "A"


def test_a_comp_package_folder_opens(client):
    # On macOS a .comp is a folder (a package); dropped on formvis it arrives as files with their paths.
    _, m = _comp()
    files = [("files", ("manifest.json", json.dumps(m).encode(), "application/json")), ("files", ("A.png", png_bytes(), "image/png"))]
    r = client.post("/api/projects/import", files=files, data={"paths": ["Old Work.comp/manifest.json", "Old Work.comp/images/A.png"]})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Old Work"


def test_versions_one_to_seven_open_and_others_are_refused(client):
    for v in range(1, 8):
        assert _post(client, "v.comp", _comp(version=v)[0]).status_code == 200, v
    assert _post(client, "v.comp", _comp(version=8)[0]).status_code == 422
    assert _post(client, "v.comp", _comp(fmt="com.example.other")[0]).status_code == 422    # not a project id
    assert _post(client, "v.comp", _comp(fmt="project")[0]).status_code == 422


def test_the_full_validation_still_guards_comp(client):
    missing = _post(client, "m.comp", _comp(images=())[0])
    assert missing.status_code == 422 and "missing" in missing.json()["detail"]
    cycle = [{"id": "A", "name": "A", "isVisible": True, "imageFile": "A.png", "maskSourceID": "B"},
             {"id": "B", "name": "B", "isVisible": True, "imageFile": "A.png", "maskSourceID": "A"}]
    assert _post(client, "c.comp", _comp(layers=cycle)[0]).status_code == 422


def test_comp_is_never_written(client):
    # Import only: the engine's export refuses a .comp name.
    r = client.post("/api/io/export", files={"file": ("f", b"x", "application/octet-stream")}, data={"name": "Old Work.comp"})
    assert r.status_code >= 400
