VIS = "window.formvis.engine.current.doc.layers.map((l) => [l.name, l.visible !== false])"


def test_show_only_layer_hides_the_others_and_a_second_run_brings_them_back(page):
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'SO', 'white')")
    page.evaluate("window.formvis.engine.addLayer(); window.formvis.engine.addLayer()")
    assert page.evaluate("window.formvis.engine.activeLayer.name") == "Layer 2"
    page.evaluate("window.formvis.commands.run('show-only-layer')")
    assert page.evaluate(VIS) == [["Background", False], ["Layer 1", False], ["Layer 2", True]]
    assert page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(5, 5, 1, 1).data[3]") == 0
    page.evaluate("window.formvis.commands.run('show-only-layer')")
    assert page.evaluate(VIS) == [["Background", True], ["Layer 1", True], ["Layer 2", True]]
    assert page.evaluate("window.formvis.engine.flattened().getContext('2d').getImageData(5, 5, 1, 1).data[0]") == 255
