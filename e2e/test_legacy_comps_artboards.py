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


# Layer comps (record, change, apply, step, delete) and Artboard from Layers: the comp list and the layers' visible state
# and artboards are read back, and the flattened picture shows what a comp restores.
PX = "([x, y]) => Array.from(window.formvis.engine.flattened().getContext('2d').getImageData(x, y, 1, 1).data)"
RUN = "(id) => window.formvis.commands.run(id)"
ARGS = "([id, a]) => window.formvis.commands.run(id, a)"
TWO = """async () => {
  const e = window.formvis.engine, E = await import('/src/engine/index.ts');
  e.newDocument(40, 20, 'F', 'white');
  const rect = (r, g, b) => { e.fg = { r, g, b }; e.applySelection(E.SelectionMask.cropped(0, 0, 20, 20, new Uint8Array(400).fill(255)), 'replace', 's'); e.fill('fg'); e.deselect(); };
  e.addLayer(); rect(255, 0, 0);
  e.addLayer(); rect(0, 0, 255);
}"""
COMPS = "() => (window.formvis.engine.current.doc.comps ?? []).map((c) => c.name)"
VIS = "() => window.formvis.engine.current.doc.layers.map((l) => l.visible)"
BLUE = [0, 0, 255, 255]


def near(a, b, t=3):
    return all(abs(x - y) <= t for x, y in zip(a, b))


@steady
def test_new_layer_comp_is_listed_under_its_name(page):
    page.evaluate(TWO)
    page.evaluate(ARGS, ["layer-comp-new", {"name": "Both"}])
    assert page.evaluate(COMPS) == ["Both"]
    page.evaluate(ARGS, ["layer-comp-new", {}])
    names = page.evaluate(COMPS)
    assert len(names) == 2 and names[1] != "Both" and names[1]


@steady
def test_applying_a_comp_restores_the_visibility_it_recorded(page):
    page.evaluate(TWO)
    page.evaluate(ARGS, ["layer-comp-new", {"name": "Both"}])
    page.evaluate(RUN, "hide-layers")
    assert page.evaluate(VIS)[-1] is False and not near(page.evaluate(PX, [5, 5]), BLUE)
    page.evaluate(ARGS, ["layer-comp-apply", {"name": "Both"}])
    assert all(page.evaluate(VIS)) and near(page.evaluate(PX, [5, 5]), BLUE)


@steady
def test_a_comp_without_visibility_leaves_it_alone(page):
    page.evaluate(TWO)
    page.evaluate(ARGS, ["layer-comp-new", {"name": "Quiet", "visibility": False}])
    page.evaluate(RUN, "hide-layers")
    page.evaluate(ARGS, ["layer-comp-apply", {"name": "Quiet"}])
    assert page.evaluate(VIS)[-1] is False


@steady
def test_next_and_previous_step_through_the_comps_and_wrap(page):
    page.evaluate(TWO)
    page.evaluate(ARGS, ["layer-comp-new", {"name": "Shown"}])
    page.evaluate(RUN, "hide-layers")
    page.evaluate(ARGS, ["layer-comp-new", {"name": "Hidden"}])
    active = "() => { const d = window.formvis.engine.current.doc; return d.comps.find((c) => c.id === d.activeComp)?.name ?? null; }"
    assert page.evaluate(active) == "Hidden"
    page.evaluate(RUN, "layer-comp-next")
    assert page.evaluate(active) == "Shown" and near(page.evaluate(PX, [5, 5]), BLUE)
    page.evaluate(RUN, "layer-comp-previous")
    assert page.evaluate(active) == "Hidden" and not near(page.evaluate(PX, [5, 5]), BLUE)


@steady
def test_duplicate_and_delete_change_the_list(page):
    page.evaluate(TWO)
    page.evaluate(ARGS, ["layer-comp-new", {"name": "One"}])
    page.evaluate(RUN, "layer-comp-duplicate")
    assert len(page.evaluate(COMPS)) == 2
    page.evaluate(RUN, "layer-comp-delete")
    assert len(page.evaluate(COMPS)) == 1
    page.evaluate(RUN, "undo")
    assert len(page.evaluate(COMPS)) == 2


@steady
def test_artboard_from_layers_wraps_the_layers_in_an_artboard(page):
    page.evaluate(TWO)
    before = page.evaluate("() => window.formvis.engine.current.doc.layers.filter((l) => l.artboard).length")
    assert before == 0
    page.evaluate(RUN, "artboard-from-layers")
    boards = page.evaluate("() => window.formvis.engine.current.doc.layers.filter((l) => l.artboard).map((l) => [l.transform.w, l.transform.h])")
    assert len(boards) == 1 and boards[0][0] >= 20 and boards[0][1] >= 20
    page.evaluate(RUN, "undo")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.filter((l) => l.artboard).length") == 0


@steady
def test_new_artboard_adds_one_and_rotate_by_angle_refuses_with_artboards(page):
    page.evaluate(TWO)
    page.evaluate(RUN, "new-artboard")
    assert page.evaluate("() => window.formvis.engine.current.doc.layers.filter((l) => l.artboard).length") == 1
    assert page.evaluate("() => window.formvis.engine.rotateCanvasBy(30)") is False
