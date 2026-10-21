import functools
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError

FX = Path(__file__).resolve().parent / "fixtures"
PIXEL = """([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"""
REPORT = """() => { const d = [...document.querySelectorAll('.cv-dialog')].filter((x) => x.offsetParent).pop(); if (!d) return null; const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Import'); if (!b) return null; const t = d.textContent; b.click(); return t; }"""
TOASTS = """() => [...document.querySelectorAll('[class*=toast]')].map((x) => x.textContent).filter(Boolean)"""


def steady(fn):
    @functools.wraps(fn)
    def run(page, tmp_path):
        for attempt in range(3):
            try:
                return fn(page, tmp_path)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


def open_fixture(page, name, wait=20.0):
    """Opens a fixture through the Open input; clicks Import on the PSD report sheet and returns its text (or None)."""
    count = page.evaluate("window.formvis.engine.projects.length")
    page.set_input_files("input[data-role='open-files']", str(FX / name))
    report, left = None, int(wait * 1000 / 250)
    while left > 0 and page.evaluate("window.formvis.engine.projects.length") <= count:
        got = page.evaluate(REPORT)
        report = got or report
        page.wait_for_timeout(250)
        left -= 1
    opened = page.evaluate("window.formvis.engine.projects.length") > count
    return opened, report


def near(a, b, t):
    return all(abs(p - q) <= t for p, q in zip(a[:3], b))
