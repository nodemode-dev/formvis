# D13: OpenType Features run from the command palette with no arguments wiped every feature on the type layer.

MAKE = """async () => { const e = window.formvis.engine; e.newDocument(400, 200, 'T', 'white');
  await e.createTextLayer({ x: 10, y: 100 }, { ...e.textSettings, content: 'office 1/2 1st', size: 48, color: { r: 0, g: 0, b: 0 }, box: null, direction: 'horizontal' }); }"""
FEATURES = "window.formvis.engine.current.activeLayer.text.features || []"


def test_the_command_without_arguments_leaves_the_layers_features_alone(page):
    page.evaluate(MAKE)
    page.evaluate("window.formvis.commands.run('type-features', { features: 'dlig,onum' })")
    page.wait_for_function(f"({FEATURES}).length === 2")
    assert page.evaluate(FEATURES) == ["dlig", "onum"]
    steps = page.evaluate("window.formvis.engine.historySteps.names.length")
    page.evaluate("window.formvis.commands.run('type-features')")
    assert page.evaluate(FEATURES) == ["dlig", "onum"]
    assert page.evaluate("window.formvis.engine.historySteps.names.length") == steps
