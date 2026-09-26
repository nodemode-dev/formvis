import json

from e2e.conftest import open_app

# The desktop shell stood in for: @tauri-apps/api's invoke calls window.__TAURI_INTERNALS__.invoke, which records each
# command with its arguments (raw bytes as their length) and headers. The Native GPU renderer is chosen in Preferences
# before the app loads. The renderer itself is tested in Rust (native/sonny-render).
SHELL = """
localStorage.setItem('sonny.prefs', JSON.stringify({ useGpu: true, renderer: 'native' }));
window.__native = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args, opts) => {
    const bytes = args instanceof Uint8Array ? args.length : null;
    window.__native.push({ cmd, args: bytes === null ? args : null, bytes, headers: opts && opts.headers ? opts.headers : null });
    if (cmd === 'native_start') return 'Stand-in adapter (Vulkan)';
    if (cmd === 'native_present') return true;
    return null;
  },
  transformCallback: () => 0,
};
"""


def app(context):
    page = context.new_page()
    page.add_init_script(SHELL)
    open_app(page)
    page.wait_for_function("document.querySelector('.cv-st-gpu')?.textContent === 'GPU: Native GPU'", timeout=20000)
    return page


def calls(page, cmd):
    return page.evaluate(f"window.__native.filter((c) => c.cmd === {json.dumps(cmd)})")


def presents(page):
    return len(calls(page, "native_present"))


def wait_present_after(page, n):
    page.wait_for_function(f"window.__native.filter((c) => c.cmd === 'native_present').length > {n}", timeout=10000)


SCENE = """async () => { const E = await import('/src/engine/index.ts'), e = window.sonny.engine; e.newDocument(200, 100, 'N', 'white'); const bg = e.current.activeId;
  e.addLayer(); const p = e.current, top = p.activeId, l = p.layer(top); l.raster = new E.Raster(200, 100);
  l.raster.ctx.fillStyle = 'rgb(220,40,40)'; l.raster.ctx.fillRect(20, 20, 60, 40); l.raster.touch();
  p.updateLayer(top, { blend: 'multiply', opacity: 0.5 }); e.emit('render', null); return { bg, top }; }"""


def test_automatic_never_picks_the_native_renderer(page):
    r = page.evaluate("""async () => { const P = await import('/src/gpu/probe.ts'), probe = { webgpu: null, webgl2: null, native: true };
      return { auto: P.chooseRenderer(probe, true, 'auto').mode, chosen: P.chooseRenderer(probe, true, 'native').mode,
        browser: P.chooseRenderer({ webgpu: null, webgl2: null, native: false }, true, 'native') }; }""")
    assert r["auto"] == "cpu" and r["chosen"] == "native", r
    assert r["browser"]["mode"] == "cpu" and "only in the desktop app" in r["browser"]["reason"], r   # says why, with no GPU at all too


def test_chosen_it_mirrors_the_document_and_presents(context):
    page = app(context)
    assert calls(page, "native_start"), "the shell was asked to start the native canvas"
    n = presents(page)
    ids = page.evaluate(SCENE)
    wait_present_after(page, n)
    docs = calls(page, "native_doc")
    assert docs[-1]["args"] == {"width": 200, "height": 100}, docs
    puts = calls(page, "native_put")
    geo = {(p["headers"]["x-lw"], p["headers"]["x-lh"], p["bytes"]) for p in puts}
    assert ("200", "100", 200 * 100 * 4) in geo, puts           # each layer's pixels, with matching geometry
    stack = calls(page, "native_stack")[-1]["args"]["stack"]
    assert [e["mode"] for e in stack] == [0, 3] and [e["opacity"] for e in stack] == [1, 0.5], stack   # Multiply is sonny's index 3
    assert all(e["transform"] is None for e in stack), stack
    assert page.evaluate("document.documentElement.classList.contains('is-native-canvas')")
    page.close()


def test_only_changed_layers_are_sent_again_and_a_clip_names_its_base(context):
    page = app(context)
    n = presents(page)
    ids = page.evaluate(SCENE)
    wait_present_after(page, n)
    stack = calls(page, "native_stack")[-1]["args"]["stack"]
    page.evaluate("window.__native.length = 0")
    # Paint on the top layer only: exactly one layer's pixels are sent again.
    page.evaluate(f"() => {{ const p = window.sonny.engine.current, l = p.layer('{ids['top']}'); l.raster.ctx.fillRect(100, 10, 20, 20); l.raster.touch(); window.sonny.engine.emit('render', null); }}")
    page.wait_for_function("window.__native.some((c) => c.cmd === 'native_present')", timeout=10000)
    puts = calls(page, "native_put")
    assert len(puts) == 1 and puts[0]["headers"]["x-id"] == stack[1]["id"], puts
    # Clip the top layer to the background: its entry names the background's id.
    n = presents(page)
    page.evaluate(f"() => {{ window.sonny.engine.current.updateLayer('{ids['top']}', {{ clipId: '{ids['bg']}' }}); window.sonny.engine.emit('render', null); }}")
    wait_present_after(page, n)
    stack2 = calls(page, "native_stack")[-1]["args"]["stack"]
    assert stack2[1]["clipTo"] == stack2[0]["id"], stack2
    page.close()


def test_what_it_cannot_draw_yet_falls_back_with_the_reason(context):
    page = app(context)
    page.evaluate(SCENE)
    page.evaluate("window.sonny.engine.addAdjustmentLayer('hsv')")   # a 3D lookup table
    page.wait_for_function("document.querySelector('.cv-st-gpu')?.textContent === 'GPU: CPU'", timeout=10000)
    reason = page.evaluate("document.querySelector('.cv-st-gpu').title")
    assert "3D lookup table" in reason, reason
    page.close()
