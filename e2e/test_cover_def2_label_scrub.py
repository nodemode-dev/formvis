# CO-0284: dragging a number field's label changes its value (Shift ten times faster), in dialogs and the options bar, not only Layers Opacity and Fill.
SETUP = """async () => { const e = window.formvis.engine; e.newDocument(400, 200, 'S', 'white');
  window.formvis.commands.run('measure-scale', { pixels: 100, length: 10, units: 'cm' });
  window.formvis.commands.run('measure-scale-marker'); await new Promise((r) => setTimeout(r, 400)); }"""
VALUE = """() => { const d = [...document.querySelectorAll('.cv-dialog')].find((x) => x.offsetParent && /Scale Marker/.test(x.textContent));
  return Number([...d.querySelectorAll('.cv-field')].find((f) => f.querySelector('span').textContent === 'Font Size').querySelector('input').value); }"""
LABEL = """() => { const d = [...document.querySelectorAll('.cv-dialog')].find((x) => x.offsetParent && /Scale Marker/.test(x.textContent));
  const s = [...d.querySelectorAll('.cv-field')].find((f) => f.querySelector('span').textContent === 'Font Size').querySelector('span');
  s.setAttribute('data-scrub-test', '1'); return true; }"""


def drag(page, dx, shift=False):
    box = page.locator("[data-scrub-test='1']").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    if shift:
        page.keyboard.down("Shift")
    for step in range(1, 11):
        page.mouse.move(x + dx * step / 10, y)
    page.mouse.up()
    if shift:
        page.keyboard.up("Shift")


def test_dragging_a_dialog_number_fields_label_changes_the_value(page):
    page.evaluate(SETUP)
    page.evaluate(LABEL)
    start = page.evaluate(VALUE)
    drag(page, 40)
    plain = page.evaluate(VALUE)
    assert plain > start
    drag(page, -40)
    back = page.evaluate(VALUE)
    assert back < plain
    drag(page, 40, shift=True)
    assert page.evaluate(VALUE) - back > plain - back
