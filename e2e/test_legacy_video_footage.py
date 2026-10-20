import functools
import json
import subprocess
import zipfile

import pytest
from playwright.sync_api import Error as PlaywrightError

# Video layers from real footage: a clip made with ffmpeg (24 frames of a red square moving right at 12 fps) goes in
# through the file input of New Video Layer from File, Replace Footage and Reload Frame; Interpret Footage changes the
# footage frame rate; Render Video writes an MP4, a GIF and a PNG sequence that ffprobe and frame extraction read back.


def steady(fn):
    @functools.wraps(fn)
    def run(page, *args, **kwargs):
        for attempt in range(3):
            try:
                return fn(page, *args, **kwargs)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


W, H = 64, 48
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
FRAMES = "() => { const l = window.formvis.engine.activeLayer; return l && l.video ? l.video.frames.length : null; }"
TRACK = "() => { const e = window.formvis.engine, l = e.activeLayer, t = e.video.tracks[l.id]; return { start: t.start, length: t.length, duration: e.video.duration, fps: e.video.fps }; }"
FRAME_PX = "([f, x, y]) => { const s = window.formvis.engine.renderVideoFrame(f); return Array.from(s.getContext('2d').getImageData(x, y, 1, 1).data); }"
RED = [255, 0, 0]
BLUE = [0, 0, 255]
WHITE = [255, 255, 255]


def near(a, b, t=45):
    return all(abs(x - y) <= t for x, y in zip(a[:3], b))


def make_clip(path, colour, frames=24, fps=12, step=2):
    graph = f"color=white:s={W}x{H}:r={fps}[bg];color={colour}:s=16x16:r={fps}[sq];[bg][sq]overlay=x='n*{step}':y=16:shortest=1"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", graph, "-frames:v", str(frames),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "10", str(path)], check=True)


@pytest.fixture(scope="module")
def red_clip(tmp_path_factory):
    p = tmp_path_factory.mktemp("clips") / "red.mp4"
    make_clip(p, "red")
    return p


@pytest.fixture(scope="module")
def blue_clip(tmp_path_factory):
    p = tmp_path_factory.mktemp("clips") / "blue.mp4"
    make_clip(p, "blue", frames=10, step=4)
    return p


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
                          "-show_entries", "stream=nb_read_frames,width,height,r_frame_rate:format=duration",
                          "-of", "json", str(path)], check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return {"frames": int(s["nb_read_frames"]), "w": s["width"], "h": s["height"], "rate": s["r_frame_rate"], "duration": float(j["format"]["duration"])}


def extract(path, index, out_png):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-vf", f"select=eq(n\\,{index})", "-frames:v", "1", str(out_png)], check=True)
    from PIL import Image
    return Image.open(out_png).convert("RGB")


def new_doc(page, fps=None):
    page.evaluate(f"() => {{ const e = window.formvis.engine; e.newDocument({W}, {H}, 'V', 'white'); " + (f"e.createVideoTimeline({fps}, 2);" if fps else "") + " }")


def choose(page, command, clip):
    with page.expect_file_chooser(timeout=15000) as fc:
        page.evaluate(RUN, [command, None])
    fc.value.set_files(str(clip))


def wait_frames(page, n):
    page.wait_for_function(f"() => {{ const l = window.formvis.engine.activeLayer; return !!l && !!l.video && l.video.frames.length === {n}; }}", timeout=60000)


def at(page, f):
    page.evaluate("(f) => window.formvis.engine.setVideoTime(f)", f)


def square_x(f, step=2):
    return f * step + 8


@steady
def test_video_layer_from_file_has_a_frame_per_clip_frame_and_the_clip_pixels(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    assert page.evaluate(FRAMES) == 24
    assert page.evaluate(TRACK) == {"start": 0, "length": 24, "duration": 24, "fps": 12}
    assert page.evaluate("() => window.formvis.engine.activeLayer.name") == "red"
    for f in (0, 10, 23):
        at(page, f)
        assert near(page.evaluate(PX, [square_x(f), 24]), RED), f
        assert near(page.evaluate(PX, [60, 2]), WHITE), f
    at(page, 0)
    assert near(page.evaluate(PX, [square_x(10), 24]), WHITE)


@steady
def test_video_layer_from_file_makes_a_timeline_when_there_is_none(page, red_clip):
    new_doc(page)
    assert page.evaluate("() => window.formvis.engine.video") is None
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    t = page.evaluate(TRACK)
    assert t["length"] == 24 and t["duration"] >= 24 and t["fps"] == 30


@steady
def test_video_layer_from_file_is_one_undo_step(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    n = page.evaluate("() => window.formvis.engine.current.doc.layers.length")
    page.evaluate("() => window.formvis.engine.undo()")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.length") == n - 1


@steady
def test_timeline_frame_stepping_with_footage_follows_the_square(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    at(page, 0)
    for f in range(1, 24):
        page.evaluate("() => window.formvis.engine.setVideoTime(window.formvis.engine.video.current + 1)")
        assert page.evaluate("() => window.formvis.engine.video.current") == f
        assert near(page.evaluate(PX, [square_x(f), 24]), RED), f
        assert near(page.evaluate(PX, [square_x(f - 1) - 6 if f > 1 else 60, 40]), WHITE), f
    page.evaluate("() => window.formvis.engine.setVideoTime(100)")
    assert page.evaluate("() => window.formvis.engine.video.current") == 23
    for f in (5, 17, 2):
        at(page, f)
        assert near(page.evaluate(PX, [square_x(f), 24]), RED), f


@steady
def test_rendered_frames_of_the_footage_layer_match_the_clip(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    at(page, 0)
    for f in (3, 12, 20):
        assert near(page.evaluate(FRAME_PX, [f, square_x(f), 24]), RED), f
        assert near(page.evaluate(FRAME_PX, [f, 62, 44]), WHITE), f


@steady
def test_replace_footage_swaps_the_clip_and_keeps_the_place(page, red_clip, blue_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    choose(page, "video-replace-footage", blue_clip)
    wait_frames(page, 10)
    t = page.evaluate(TRACK)
    assert t["start"] == 0 and t["length"] == 10
    at(page, 0)
    assert near(page.evaluate(PX, [8, 24]), BLUE)
    at(page, 5)
    assert near(page.evaluate(PX, [5 * 4 + 8, 24]), BLUE)
    assert near(page.evaluate(PX, [5 * 4 + 8, 24 + 20]), WHITE)
    page.evaluate("() => window.formvis.engine.undo()")
    wait_frames(page, 24)
    at(page, 5)
    assert near(page.evaluate(PX, [square_x(5), 24]), RED)


@steady
def test_replace_footage_discards_paint_on_the_old_frames(page, red_clip, blue_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    page.evaluate("""async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.fg = { r: 0, g: 200, b: 0 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 8, 8, new Uint8Array(64).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }""")
    assert page.evaluate(PX, [3, 3])[1] > 150
    choose(page, "video-replace-footage", blue_clip)
    wait_frames(page, 10)
    at(page, 0)
    assert near(page.evaluate(PX, [3, 3]), WHITE)


@steady
def test_reload_frame_restores_only_the_playhead_frame_from_the_clip(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    paint = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
      e.fg = { r: 0, g: 200, b: 0 };
      e.applySelection(E.SelectionMask.cropped(0, 0, 8, 8, new Uint8Array(64).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""
    at(page, 4)
    page.evaluate(paint)
    at(page, 9)
    page.evaluate(paint)
    assert page.evaluate(PX, [3, 3])[1] > 150
    choose(page, "video-reload-frame", red_clip)
    page.wait_for_function("([x, y]) => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data; return d[0] > 200 && d[1] > 200; }", arg=[3, 3], timeout=30000)
    assert near(page.evaluate(PX, [3, 3]), WHITE)
    assert near(page.evaluate(PX, [square_x(9), 24]), RED)
    at(page, 4)
    px = page.evaluate(PX, [3, 3])
    assert px[1] > 150 and px[0] < 80
    page.evaluate("() => window.formvis.engine.undo()")
    at(page, 9)
    px = page.evaluate(PX, [3, 3])
    assert px[1] > 150 and px[0] < 80


@steady
def test_reload_frame_takes_the_frame_at_the_same_place_in_a_different_clip(page, red_clip, blue_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    at(page, 3)
    choose(page, "video-reload-frame", blue_clip)
    page.wait_for_function("([x, y]) => { const d = window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data; return d[2] > 200 && d[0] < 100; }", arg=[3 * 4 + 8, 24], timeout=30000)
    assert page.evaluate(FRAMES) == 24
    at(page, 2)
    assert near(page.evaluate(PX, [square_x(2), 24]), RED)
    at(page, 3)
    assert near(page.evaluate(PX, [3 * 4 + 8, 24]), BLUE)


@steady
def test_interpret_footage_at_half_the_rate_doubles_the_clip_and_slows_the_pictures(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    assert page.evaluate("() => window.formvis.engine.interpretFootage({ fps: 6 })") is True
    assert page.evaluate(TRACK) == {"start": 0, "length": 48, "duration": 48, "fps": 12}
    for t, src in ((0, 0), (1, 0), (2, 1), (9, 4), (47, 23)):
        at(page, t)
        assert near(page.evaluate(PX, [square_x(src), 24]), RED), (t, src)
    page.evaluate("() => window.formvis.engine.undo()")
    assert page.evaluate(TRACK)["length"] == 24 and page.evaluate(TRACK)["duration"] == 24


@steady
def test_interpret_footage_at_double_the_rate_halves_the_clip(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    page.evaluate("() => window.formvis.engine.interpretFootage({ fps: 24 })")
    assert page.evaluate(TRACK)["length"] == 12
    at(page, 3)
    assert near(page.evaluate(PX, [square_x(6), 24]), RED)
    at(page, 11)
    assert near(page.evaluate(PX, [square_x(22), 24]), RED)


@steady
def test_interpret_footage_loop_repeats_the_clip(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    page.evaluate("() => window.formvis.engine.interpretFootage({ loop: 2 })")
    t = page.evaluate(TRACK)
    assert t["length"] == 48 and t["duration"] == 48
    at(page, 30)
    assert near(page.evaluate(PX, [square_x(6), 24]), RED)
    assert near(page.evaluate(PX, [square_x(30 % 24) + 20, 24]), WHITE)


@steady
def test_interpret_footage_dialog_applies_the_frame_rate(page, red_clip):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    page.evaluate(RUN, ["video-interpret-footage", None])
    dlg = page.locator(".cv-dialog:visible", has_text="Interpret Footage")
    dlg.wait_for(timeout=10000)
    rate = dlg.locator("input").first
    assert rate.input_value() == "12"
    rate.fill("6")
    rate.press("Tab")
    dlg.get_by_role("button", name="OK").click()
    page.wait_for_function("() => window.formvis.engine.video.tracks[window.formvis.engine.activeLayer.id].length === 48", timeout=10000)
    assert page.evaluate("() => window.formvis.engine.activeLayer.video.interpret.fps") == 6


def render(page, fmt, tmp_path):
    page.evaluate(RUN, ["render-video", None])
    dlg = page.locator(".cv-dialog:visible", has_text="Render Video")
    dlg.wait_for(timeout=10000)
    dlg.locator("select[aria-label=Format]").select_option(fmt)
    with page.expect_download(timeout=90000) as dl:
        dlg.get_by_role("button", name="Render").click()
    out = tmp_path / dl.value.suggested_filename
    dl.value.save_as(str(out))
    return out


@steady
def test_render_video_mp4_has_the_frame_count_duration_size_and_frame_pixels(page, red_clip, tmp_path):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    out = render(page, "mp4", tmp_path)
    info = probe(out)
    assert (info["frames"], info["w"], info["h"]) == (24, W, H)
    num, den = (int(x) for x in info["rate"].split("/"))
    assert abs(num / den - 12) < 0.1
    assert abs(info["duration"] - 2.0) < 0.15
    for f in (0, 11, 23):
        img = extract(out, f, tmp_path / f"f{f}.png")
        assert near(img.getpixel((square_x(f), 24)), RED, 60), f
        assert near(img.getpixel((60, 2)), WHITE, 30), f


@steady
def test_render_video_png_sequence_matches_each_footage_frame(page, red_clip, tmp_path):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    zpath = render(page, "png", tmp_path)
    from PIL import Image
    import io
    with zipfile.ZipFile(zpath) as z:
        names = sorted(n for n in z.namelist() if n.lower().endswith(".png"))
        assert len(names) == 24
        for f in (0, 7, 23):
            img = Image.open(io.BytesIO(z.read(names[f]))).convert("RGB")
            assert img.size == (W, H)
            assert near(img.getpixel((square_x(f), 24)), RED), f
            assert near(img.getpixel((60, 2)), WHITE), f


@steady
def test_render_video_gif_has_the_frame_count_and_the_frame_delay(page, red_clip, tmp_path):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    out = render(page, "gif", tmp_path)
    from PIL import Image
    with Image.open(out) as g:
        assert g.n_frames == 24
        assert g.size == (W, H)
        assert abs(g.info.get("duration", 0) - 83) <= 20
        g.seek(15)
        assert near(g.convert("RGB").getpixel((square_x(15), 24)), RED, 60)


@steady
def test_render_video_of_a_replaced_clip_has_the_new_length_and_colour(page, red_clip, blue_clip, tmp_path):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    choose(page, "video-replace-footage", blue_clip)
    wait_frames(page, 10)
    page.evaluate("() => window.formvis.engine.interpretFootage({ fps: 12 })")
    out = render(page, "gif", tmp_path)
    from PIL import Image
    with Image.open(out) as g:
        assert g.n_frames >= 10
        g.seek(6)
        assert near(g.convert("RGB").getpixel((6 * 4 + 8, 24)), BLUE, 60)


@steady
def test_render_video_dialog_range_renders_only_those_frames(page, red_clip, tmp_path):
    new_doc(page, 12)
    choose(page, "video-layer-from-file", red_clip)
    wait_frames(page, 24)
    page.evaluate(RUN, ["render-video", None])
    dlg = page.locator(".cv-dialog:visible", has_text="Render Video")
    dlg.wait_for(timeout=10000)
    dlg.locator("select[aria-label=Format]").select_option("mp4")
    dlg.locator("select[aria-label=Range]").select_option("custom")
    dlg.locator("input[aria-label='From frame']").fill("4")
    dlg.locator("input[aria-label='To frame']").fill("16")
    dlg.locator("select[aria-label=Size]").select_option("0.5")
    assert "12 frames" in dlg.locator(".cv-dialog-note").inner_text()
    with page.expect_download(timeout=90000) as dl:
        dlg.get_by_role("button", name="Render").click()
    out = tmp_path / dl.value.suggested_filename
    dl.value.save_as(str(out))
    info = probe(out)
    assert (info["frames"], info["w"], info["h"]) == (12, W // 2, H // 2)
    img = extract(out, 0, tmp_path / "first.png")
    assert near(img.getpixel((square_x(4) // 2, 12)), RED, 70)
