SETUP = """async () => {
  const T = await import('/src/engine/text.ts'), e = window.formvis.engine, base = { ...T.defaultText(), family: 'sans-serif' };
  e.newDocument(500, 300, 'S', 'white');
  const ids = [];
  for (const [content, size, y] of [['Alpha', 40, 80], ['Beta', 20, 160], ['Gamma', 28, 240]]) {
    await e.createTextLayer({ x: 30, y }, { ...base, content, size });
    ids.push(e.current.activeId);
  }
  window.__ids = ids;
}"""

SELECT = "(i) => { const p = window.formvis.engine.current; p.activeId = window.__ids[i]; }"
INFO = """() => window.__ids.map((id) => { const l = window.formvis.engine.current.layer(id);
  return { content: l.text.content, size: l.text.size, style: l.text.style ?? null, width: l.raster.width }; })"""


def info(page):
    return page.evaluate(INFO)


def test_new_apply_redefine_and_delete(page):
    page.evaluate(SETUP)
    page.evaluate(SELECT, 0)
    sid = page.evaluate("window.formvis.engine.newParagraphStyle('Heading')")
    styles = page.evaluate("window.formvis.engine.paragraphStyles.map((s) => ({ name: s.name, size: s.size }))")
    assert styles == [{"name": "Heading", "size": 40}], styles
    assert info(page)[0]["style"] == sid                                   # the source layer is linked

    page.evaluate(SELECT, 1)
    page.evaluate(f"window.formvis.engine.applyParagraphStyle('{sid}')")
    b = info(page)[1]
    assert b["size"] == 40 and b["content"] == "Beta" and b["style"] == sid, b   # its settings, its own text

    page.evaluate(SELECT, 0)
    page.evaluate("""async () => { const e = window.formvis.engine, l = e.current.layer(window.__ids[0]); await e.updateTextLayer(l.id, { ...l.text, size: 64 }); }""")
    before = info(page)
    page.evaluate(f"window.formvis.engine.redefineParagraphStyle('{sid}')")
    after = info(page)
    assert page.evaluate("window.formvis.engine.paragraphStyles[0].size") == 64
    assert after[1]["size"] == 64 and after[1]["width"] > before[1]["width"], (before, after)    # linked Beta re-rendered
    assert after[2] == before[2], (before, after)                                                # unlinked Gamma untouched
    page.evaluate("window.formvis.engine.undo()")
    assert info(page)[1]["size"] == 40 and page.evaluate("window.formvis.engine.paragraphStyles[0].size") == 40   # one step

    page.evaluate(f"window.formvis.engine.deleteParagraphStyle('{sid}')")
    gone = info(page)
    assert page.evaluate("window.formvis.engine.paragraphStyles.length") == 0
    assert gone[1]["style"] is None and gone[1]["size"] == 40, gone          # unlinked, its look kept
    page.evaluate("window.formvis.engine.undo()")
    assert page.evaluate("window.formvis.engine.paragraphStyles.length") == 1 and info(page)[1]["style"] == sid


def test_styles_and_links_survive_saving_and_reopening(page):
    page.evaluate(SETUP)
    page.evaluate(SELECT, 2)
    sid = page.evaluate("window.formvis.engine.newParagraphStyle('Caption')")
    r = page.evaluate("""async (sid) => {
      const S = await import('/src/io/project-io.ts'), e = window.formvis.engine;
      const out = await S.serialize(e.current.doc, e.current.activeId), get = async (n) => out.files.find((f) => f.name === n).blob;
      const back = await S.deserialize(JSON.parse(JSON.stringify(out.manifest)), get);
      return { styles: (back.doc.paragraphStyles || []).map((s) => [s.id, s.name, s.size]), linked: back.doc.layers.filter((l) => l.text?.style === sid).map((l) => l.text.content) };
    }""", sid)
    assert r == {"styles": [[sid, "Caption", 28]], "linked": ["Gamma"]}, r


def test_the_dialog_makes_and_lists_a_style(page):
    page.evaluate(SETUP)
    page.evaluate(SELECT, 1)
    assert page.evaluate("window.formvis.commands.run('paragraph-styles')")
    dlg = page.locator(".cv-scrim:not([hidden]) .cv-dialog")
    dlg.locator("input[type=text]").fill("Body")
    dlg.locator("button", has_text="New Style").click()
    page.wait_for_function("document.querySelector('.cv-scrim:not([hidden]) .cv-pstyle-list').options.length === 1")   # Character Styles shares the class and sits earlier in the page
    assert page.evaluate("document.querySelector('.cv-scrim:not([hidden]) .cv-pstyle-list').options[0].text") == "Body"
    page.keyboard.press("Escape")
