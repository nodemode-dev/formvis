"""The macOS base list keeps every package of the main one (1.62.1). A Mac installs from requirements_macos.txt (unpinned)
and every other system from requirements.txt (pinned); six packages added to the main list over time never reached the
Mac's, and without httpx the engine (which imports local generation as it starts) could not start on the owner's Mac."""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def names(file: str) -> set[str]:
    out = set()
    for line in (HERE / file).read_text().splitlines():
        spec = line.split("#")[0].strip()
        if spec and not spec.startswith("-"):
            out.add(re.split(r"[<>=!~\[; ]", spec, maxsplit=1)[0].lower().replace("_", "-"))
    return out


def test_the_macos_list_has_every_package_of_the_main_one():
    missing = names("requirements.txt") - names("requirements_macos.txt")
    assert not missing, f"in requirements.txt but not requirements_macos.txt: {sorted(missing)}"


def test_the_macos_ml_list_has_every_package_of_the_main_one():
    missing = names("requirements_ml.txt") - names("requirements_ml_macos.txt")
    assert not missing, f"in requirements_ml.txt but not requirements_ml_macos.txt: {sorted(missing)}"
