from e2e.test_cover_adjust_dialogs import PX, confirm, open_dialog, scene

COLOR = """([idx, v]) => {
  const all = [...document.querySelectorAll('.cv-scrim:not([hidden]) input[type=color]')].filter((n) => n.getClientRects().length);
  const i = all[idx];
  if (!i) throw new Error('no colour field ' + idx + ' of ' + all.length);
  i.value = v;
  i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
  return all.length;
}"""


def test_gradient_map_maps_black_and_white_to_the_chosen_colours(page):
    scene(page, [("#000", 0, 0, 50, 60), ("#fff", 50, 0, 50, 60)])
    open_dialog(page, "adj-gradientMap")
    assert page.evaluate(COLOR, [0, "#0000ff"]) == 2
    page.evaluate(COLOR, [1, "#ffff00"])
    page.wait_for_timeout(600)
    confirm(page)
    assert page.evaluate(PX, [10, 30])[:3] == [0, 0, 255]
    assert page.evaluate(PX, [90, 30])[:3] == [255, 255, 0]


def test_desaturate_gives_each_colour_the_mean_of_its_extremes(page):
    scene(page, [("rgb(200,60,40)", 0, 0, 50, 60), ("rgb(30,90,200)", 50, 0, 50, 60)])
    assert page.evaluate("window.formvis.commands.run('desaturate')")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [10, 30])[:3] == [120, 120, 120]
    assert page.evaluate(PX, [90, 30])[:3] == [115, 115, 115]


def test_equalize_stretches_two_close_greys_to_black_and_white(page):
    scene(page, [("rgb(100,100,100)", 0, 0, 50, 60), ("rgb(140,140,140)", 50, 0, 50, 60)])
    assert page.evaluate("window.formvis.commands.run('equalize')")
    page.wait_for_timeout(500)
    assert page.evaluate(PX, [10, 30])[:3] == [0, 0, 0]
    assert page.evaluate(PX, [90, 30])[:3] == [255, 255, 255]
