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
