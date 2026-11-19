import hashlib
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCK = ROOT / "frontend" / "src" / "dock"


def test_the_shared_dock_files_match_their_manifest():
    kept = json.loads((DOCK / "MANIFEST.json").read_text(encoding="utf-8"))
    assert kept["module"] == "dock" and kept["version"] == "1.1.0"
    now = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in DOCK.iterdir() if p.is_file() and p.name != "MANIFEST.json"}
    assert kept["files"] == now


def test_the_check_names_a_shared_file_edited_in_place(tmp_path):
    copy = tmp_path / "repo"
    (copy / "frontend" / "src").mkdir(parents=True)
    shutil.copytree(DOCK, copy / "frontend" / "src" / "dock")
    shutil.copytree(ROOT / "setup", copy / "setup")
    spec = importlib.util.spec_from_file_location("copied_agents", copy / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.dock_problems() == []
    with open(copy / "frontend" / "src" / "dock" / "dock.ts", "a", encoding="utf-8") as f:
        f.write("\n")
    assert module.dock_problems() == ["frontend/src/dock/dock.ts: does not match MANIFEST.json (the shared dock module changes only as a whole new version)"]


def test_the_shared_dock_imports_nothing_from_the_app():
    out = subprocess.run(["grep", "-rhoE", r"from '[^']+'|import '[^']+'", str(DOCK)], capture_output=True, text=True, check=True).stdout.split("\n")
    outside = sorted({line for line in out if line and not line.startswith(("from './", "import './", "from '@xterm/", "import '@xterm/"))})
    assert outside == [], outside
