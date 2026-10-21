# D38 (animated GIF and WebP opened as one still) and D27 (a truncated PSD opened nothing).
import io

from PIL import Image

from e2e.files2_support import downloads, scene


def open_file(page, path):
    page.set_input_files("input[data-role='import-images']", str(path))


def frames(durations, size=(24, 16)):
    return [Image.new("P", size, i) if False else Image.new("RGB", size, c) for i, c in enumerate([(250, 0, 0), (0, 250, 0), (0, 0, 250)])][: len(durations)]


def test_d38_animated_gif_opens_as_frames_with_their_delays(page, tmp_path):
    f = tmp_path / "anim.gif"
    ims = frames([100, 250, 400])
    ims[0].save(f, save_all=True, append_images=ims[1:], duration=[100, 250, 400], loop=0)
    open_file(page, f)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.timeline.frames.length === 3", timeout=20000)
    assert page.evaluate("window.formvis.engine.timeline.frames.map((x) => x.delay)") == [100, 250, 400]
    assert page.evaluate("window.formvis.commands.enabled(window.formvis.commands.get('play-animation'))") is True


def test_d38_animated_webp_opens_as_frames(page, tmp_path):
    f = tmp_path / "anim.webp"
    ims = frames([100, 250, 400])
    ims[0].save(f, save_all=True, append_images=ims[1:], duration=[100, 250, 400], loop=0, lossless=True)
    open_file(page, f)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.timeline.frames.length === 3", timeout=20000)


def test_d38_a_single_frame_gif_still_opens_as_one_picture(page, tmp_path):
    f = tmp_path / "one.gif"
    Image.new("RGB", (24, 16), (250, 0, 0)).save(f)
    open_file(page, f)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 24", timeout=20000)
    assert page.evaluate("window.formvis.engine.timeline.frames.length") <= 1


def test_d27_a_truncated_psd_opens_something_instead_of_nothing(page, tmp_path):
    scene(page)
    page.evaluate("window.__got = []")
    page.evaluate("window.formvis.commands.run('export-psd')")
    raw = downloads(page)[0][1]
    assert raw[:4] == b"8BPS"
    cut = tmp_path / "cut.psd"
    cut.write_bytes(raw[: int(len(raw) * 0.6)])
    page.evaluate("window.formvis.engine.newDocument(5, 5, 'Before', 'white')")
    open_file(page, cut)
    page.wait_for_function("window.formvis.engine.current && window.formvis.engine.current.doc.width === 16", timeout=20000)
