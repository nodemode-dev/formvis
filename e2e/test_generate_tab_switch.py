# D11: a Generative Fill result that arrives after another tab was chosen goes back to the document it was made for;
# only a closed document drops it. The model is a promise the page settles itself.

START = """async (name) => {
  const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(120, 80, name, 'white');
  e.applySelection(E.SelectionMask.cropped(10, 10, 40, 30, new Uint8Array(1200).fill(255)), 'replace', 's');
  window.__fill = null;
  window.__held = new Promise((resolve) => { window.__settle = resolve; });
  window.__done = e.generativeFill('a kite', async () => {
    const c = document.createElement('canvas'); c.width = 60; c.height = 50; const g = c.getContext('2d'); g.fillStyle = '#14c83c'; g.fillRect(0, 0, 60, 50);
    await window.__held;
    return await new Promise((r) => c.toBlob(r, 'image/png'));
  });
}"""


def test_a_result_arriving_after_a_tab_switch_goes_back_to_its_document(page):
    page.evaluate(START, "Poster")
    page.evaluate("window.formvis.engine.newDocument(50, 50, 'Other', 'white')")
    assert page.evaluate("window.formvis.engine.current.name") == "Other"
    page.evaluate("window.__settle()")
    assert page.evaluate("window.__done") is True
    got = page.evaluate("""() => { const e = window.formvis.engine, p = e.current;
      return [p.name, p.doc.layers.map((l) => l.name), e.projects.find((x) => x.name === 'Other').doc.layers.length]; }""")
    assert got[0] == "Poster" and any(n.startswith("Generative Fill") for n in got[1]) and got[2] == 1, got


def test_a_result_for_a_closed_document_is_dropped(page):
    page.evaluate(START, "Poster")
    page.evaluate("window.formvis.engine.newDocument(50, 50, 'Other', 'white')")
    page.evaluate("""() => { const e = window.formvis.engine, p = e.projects.find((x) => x.name === 'Poster'); e.closeProject(p.id); }""")
    names = page.evaluate("window.formvis.engine.projects.map((x) => x.name)")
    assert "Poster" not in names, names
    page.evaluate("window.__settle()")
    assert page.evaluate("window.__done") is False
    assert page.evaluate("window.formvis.engine.current.doc.layers.length") == 1
