# The starter prompt templates live twice: the window's (prompt-templates.ts) and the engine's (llm.STARTER_TEMPLATES, used by the MCP tool). They must match.
import re
from pathlib import Path

from app.services import llm

TS = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "io" / "prompt-templates.ts").read_text(encoding="utf-8")


def _starters() -> list[tuple[str, str]]:
    block = TS[TS.index("export const STARTERS"):TS.index("export function templates")]
    return [(m.group(1), m.group(2)) for m in re.finditer(r"\{ name: '([^']+)', text: '((?:[^'\\]|\\.)*)' \}", block)]


def _use_cases() -> list[tuple[str, str]]:
    block = TS[TS.index("export const USE_CASES"):]
    block = block[:block.index("];")]
    return [(m.group(1), m.group(2)) for m in re.finditer(r"label: '([^']+)', template: '([^']+)'", block)]


def test_window_and_engine_starters_match():
    window = _starters()
    assert len(window) >= 8
    assert dict(window) == llm.STARTER_TEMPLATES
    assert [n for n, _ in window] == list(llm.STARTER_TEMPLATES)


def test_every_use_case_has_a_starter_in_both_copies():
    cases = _use_cases()
    assert [c[0] for c in cases] == ["Generate a new picture", "Fill a selection", "Edit instruction", "Photographic", "Tag list", "Transparent asset"]
    for _, template in cases:
        assert template in llm.STARTER_TEMPLATES and template in dict(_starters())


def test_starters_are_plain_text():
    for text in llm.STARTER_TEMPLATES.values():
        assert 40 < len(text) < 600 and "—" not in text and "{" not in text
