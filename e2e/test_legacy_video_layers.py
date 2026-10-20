import functools

from playwright.sync_api import Error as PlaywrightError


def steady(fn):
    @functools.wraps(fn)
    def run(page):
        for attempt in range(3):
            try:
                return fn(page)
            except PlaywrightError as err:
                if "context was destroyed" not in str(err) or attempt == 2:
                    raise
                page.wait_for_function("window.formvis && window.formvis.engine", timeout=60000)
    return run


# Layer > Video Layers and the video timeline: a blank video layer, frame insert, duplicate, delete, restore, restore
# all, show altered, rasterize, and the timeline's clip split, fade and playhead. The frame counts on the layer, the
# playhead and the flattened pixels at each frame are read back.
RUN = "([id, p]) => window.formvis.commands.run(id, p)"
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
FRAMES = "() => { const l = window.formvis.engine.activeLayer; return l && l.video ? l.video.frames.length : null; }"
HEAD = "() => window.formvis.engine.video ? window.formvis.engine.video.current : null"
RED = [255, 0, 0, 255]
WHITE = [255, 255, 255, 255]


def near(a, b, t=3):
    return all(abs(x - y) <= t for x, y in zip(a, b))


NEW = "() => { const e = window.formvis.engine; e.newDocument(40, 40, 'V', 'white'); e.createVideoTimeline(10, 2); return e.newBlankVideoLayer(); }"
PAINT = """async () => { const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.fg = { r: 255, g: 0, b: 0 };
  e.applySelection(E.SelectionMask.cropped(0, 0, 40, 40, new Uint8Array(1600).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); }"""


def start(page):
    assert page.evaluate(NEW) is True
    page.wait_for_timeout(300)


@steady
def test_blank_video_layer_has_a_frame_for_every_timeline_frame(page):
    start(page)
    assert page.evaluate(FRAMES) == 20
    assert page.evaluate("() => window.formvis.engine.activeLayer.name") == "Video Layer"


@steady
def test_blank_video_layer_without_a_timeline_makes_150_frames(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'V', 'white')")
    page.evaluate(RUN, ["video-layer-blank", None])
    page.wait_for_timeout(400)
    assert page.evaluate(FRAMES) == 150


@steady
def test_insert_duplicate_and_delete_frame_change_the_frame_count(page):
    start(page)
    page.evaluate(RUN, ["video-insert-blank-frame", None])
    assert page.evaluate(FRAMES) == 21 and page.evaluate(HEAD) == 1
    page.evaluate(RUN, ["video-duplicate-frame", None])
    assert page.evaluate(FRAMES) == 22 and page.evaluate(HEAD) == 2
    page.evaluate(RUN, ["video-delete-frame", None])
    assert page.evaluate(FRAMES) == 21
    page.evaluate("() => window.formvis.engine.undo()")
    assert page.evaluate(FRAMES) == 22


@steady
def test_duplicate_frame_copies_the_painted_pixels_to_the_next_frame(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-duplicate-frame", None])
    assert near(page.evaluate(PX, [5, 5]), RED)
    page.evaluate("() => window.formvis.engine.setVideoTime(0)")
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_insert_blank_frame_is_empty_while_the_painted_frame_keeps_its_paint(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-insert-blank-frame", None])
    assert near(page.evaluate(PX, [5, 5]), WHITE)
    page.evaluate("() => window.formvis.engine.setVideoTime(0)")
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_restore_frame_removes_the_paint_of_that_frame_only(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-restore-frame", None])
    assert near(page.evaluate(PX, [5, 5]), WHITE)
    page.evaluate("() => window.formvis.engine.undo()")
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_restore_all_frames_clears_every_painted_frame(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate("() => window.formvis.engine.setVideoTime(3)")
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-restore-all", None])
    for f in (3, 0):
        page.evaluate("(f) => window.formvis.engine.setVideoTime(f)", f)
        assert near(page.evaluate(PX, [5, 5]), WHITE), f


@steady
def test_restore_with_nothing_painted_changes_nothing(page):
    start(page)
    assert page.evaluate("() => window.formvis.engine.restoreFrame()") is False
    assert page.evaluate("() => window.formvis.engine.restoreAllFrames()") is False


@steady
def test_show_altered_video_off_shows_the_footage_and_on_shows_the_paint(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-show-altered", {"show": False}])
    assert near(page.evaluate(PX, [5, 5]), WHITE)
    assert page.evaluate("() => !!window.formvis.commands.get('video-show-altered').checked()") is False
    page.evaluate(RUN, ["video-show-altered", {"show": True}])
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_rasterize_video_layer_leaves_a_plain_layer_with_the_current_frame(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-rasterize", None])
    assert page.evaluate("() => window.formvis.engine.activeLayer.video") is None
    assert near(page.evaluate(PX, [5, 5]), RED)


@steady
def test_delete_frame_keeps_the_last_remaining_frame(page):
    start(page)
    for _ in range(25):
        page.evaluate("() => window.formvis.engine.deleteVideoFrame()")
    assert page.evaluate(FRAMES) == 1


@steady
def test_frame_commands_are_off_on_an_ordinary_layer(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'V', 'white')")
    ids = ["video-insert-blank-frame", "video-duplicate-frame", "video-delete-frame", "video-restore-frame", "video-restore-all", "video-show-altered", "video-rasterize", "video-replace-footage", "video-interpret-footage"]
    states = page.evaluate("(ids) => ids.map((id) => !!window.formvis.commands.get(id).enabled())", ids)
    assert states == [False] * len(ids)


@steady
def test_the_timeline_playhead_moves_and_clamps(page):
    start(page)
    page.evaluate("() => window.formvis.engine.setVideoTime(7)")
    assert page.evaluate(HEAD) == 7
    page.evaluate("() => window.formvis.engine.setVideoTime(500)")
    assert page.evaluate(HEAD) <= 19
    page.evaluate("() => window.formvis.engine.setVideoTime(-5)")
    assert page.evaluate(HEAD) == 0


@steady
def test_create_and_delete_video_timeline(page):
    page.evaluate("() => window.formvis.engine.newDocument(32, 32, 'V', 'white')")
    assert page.evaluate("() => window.formvis.engine.video") is None
    page.evaluate("() => window.formvis.engine.createVideoTimeline(24, 3)")
    v = page.evaluate("() => { const t = window.formvis.engine.video; return t && { fps: t.fps, duration: t.duration }; }")
    assert v == {"fps": 24, "duration": 72}
    page.evaluate("() => window.formvis.engine.deleteVideoTimeline()")
    assert page.evaluate("() => window.formvis.engine.video") is None


@steady
def test_rendering_a_frame_gives_the_picture_at_that_frame(page):
    start(page)
    page.evaluate(PAINT)
    page.evaluate(RUN, ["video-insert-blank-frame", None])
    got = page.evaluate("""() => { const e = window.formvis.engine, a = e.renderVideoFrame(0), b = e.renderVideoFrame(1);
      const px = (s) => Array.from(s.getContext('2d').getImageData(5, 5, 1, 1).data); return [px(a), px(b)]; }""")
    assert near(got[0], RED) and near(got[1], WHITE)
