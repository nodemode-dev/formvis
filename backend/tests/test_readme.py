import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _line_counts():
    spec = importlib.util.spec_from_file_location("line_counts", ROOT / "setup" / "line_counts.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_readme_matches_the_code():
    # Plan item 19.4: the README's line counts (within 3 percent or 100 lines) and its single statement of the number of
    # blend modes must agree with the code; `python3 setup/line_counts.py` prints the current figures.
    problems = _line_counts().check(ROOT)
    assert problems == [], problems


def test_every_manifest_states_the_licence_in_licence_file():
    # formvis is Apache-2.0 (LICENSE, README); package.json, the lockfile's own entry and Cargo.toml said MIT until 1.38.0.
    import json
    import re

    assert "Apache License" in (ROOT / "LICENSE").read_text(encoding="utf-8")[:400]
    assert json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))["license"] == "Apache-2.0"
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text(encoding="utf-8"))
    assert lock["packages"][""]["license"] == "Apache-2.0"
    assert re.search(r'^license = "Apache-2.0"$', (ROOT / "src-tauri/Cargo.toml").read_text(encoding="utf-8"), re.M)
