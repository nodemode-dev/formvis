# D04: guides stayed at their old coordinates after Flip Canvas and Image Rotation (in the wrong place, or off the canvas).

SETUP = """() => { const e = window.formvis.engine; e.newDocument(200, 100, 'G', 'white'); e.addGuide('x', 30); e.addGuide('y', 20); }"""
GUIDES = "window.formvis.engine.current.doc.guides.map((g) => [g.axis, Math.round(g.at)]).sort()"


def test_guides_move_with_flip_and_rotate_and_come_back_with_undo(page):
    page.evaluate(SETUP)
    assert page.evaluate(GUIDES) == [["x", 30], ["y", 20]]
    page.evaluate("window.formvis.engine.flipCanvas(true)")
    assert page.evaluate(GUIDES) == [["x", 170], ["y", 20]]
    page.evaluate("window.formvis.engine.flipCanvas(false)")
    assert page.evaluate(GUIDES) == [["x", 170], ["y", 80]]
    page.evaluate("window.formvis.engine.rotateCanvas(1)")
    assert page.evaluate("[window.formvis.engine.current.doc.width, window.formvis.engine.current.doc.height]") == [100, 200]
    assert page.evaluate(GUIDES) == [["x", 20], ["y", 170]]
    page.evaluate("window.formvis.engine.undo(); window.formvis.engine.undo(); window.formvis.engine.undo()")
    assert page.evaluate(GUIDES) == [["x", 30], ["y", 20]]
