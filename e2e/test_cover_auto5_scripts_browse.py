import pytest

from e2e.files2_support import PIXEL, SCENE, start


def chosen(page, tmp_path, name, source):
    f = tmp_path / name
    f.write_text(source)
    with page.expect_file_chooser(timeout=10000) as fc:
        page.evaluate("window.formvis.commands.run('script-browse')")
    fc.value.set_files(str(f))


def toasts(page):
    return page.evaluate("[...document.querySelectorAll('.cv-toast')].map((t) => t.textContent)")


def px(page):
    return page.evaluate(PIXEL, [12, 2])[:3]


def test_scripts_browse_runs_a_chosen_js_file_in_a_sandbox_with_run_and_log(page, tmp_path):
    start(page)
    page.evaluate(SCENE)
    assert px(page) == [30, 40, 220]
    chosen(page, tmp_path, "ok.js", "log('hello from script'); await run('invert'); return 1;")
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'Ran ok.js: hello from script.')", timeout=10000)
    assert px(page) == [225, 215, 35]
    chosen(page, tmp_path, "bad.js", "throw new Error('boom');")
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'bad.js stopped: boom')", timeout=10000)
    chosen(page, tmp_path, "net.js", "log(typeof document + ',' + typeof window + ',' + typeof fetch); return 2;")
    page.wait_for_function("[...document.querySelectorAll('.cv-toast')].some((t) => t.textContent === 'Ran net.js: undefined,undefined,undefined.')", timeout=10000)
    assert px(page) == [225, 215, 35]
    assert page.evaluate("window.formvis.commands.run('script-browse', {source: 'log(\"x\"); return 7;'})") is True
