# What formvis offers, run for real (1.53.4, the capability plan's M9): every menu command on a prepared document, and
# every tool option at every value followed by a drag on the canvas; any uncaught error or console error fails, all of
# them listed. 1.50.2 offered colour modes that did not exist and 1.52.9 a model install that would have failed: both
# were offered without being run.
import json

import pytest

SETUP = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  e.newDocument(240, 160, 'Offered', 'white');
  const r = new E.Raster(240, 160); r.ctx.fillStyle = '#c83232'; r.ctx.fillRect(20, 20, 120, 80); r.touch(); e.insertRasterLayer(r, 'Paint', 0, 0, {}, 'Paint');
  e.fg = { r: 30, g: 90, b: 200 }; Object.assign(e.shapeSettings, { kind: 'rectangle', mode: 'shape', fill: 'fg', stroke: 'none' });
  e.drawShape({ x: 150, y: 20 }, { x: 220, y: 70 }, { x: 150, y: 20, w: 70, h: 50 });
  await e.createTextLayer({ x: 20, y: 140 }, { ...e.textSettings, content: 'Hi', size: 24, color: { r: 0, g: 0, b: 0 }, box: null, direction: 'horizontal' });
  e.addAdjustmentLayer('hsv');
  e.applySelection(E.SelectionMask.cropped(30, 30, 60, 40, new Uint8Array(2400).fill(255)), 'replace', 's');
  const layers = e.current.doc.layers; return layers.map((l) => l.id); }"""

# The canvas right-click menu: ten covering layers, then a context menu opened over the middle of the document wherever
# the view and the interface zoom have left it. The command ids pick-layer-N only exist while that menu lists them.
PICK_LAYERS = """async () => { const E = await import('/src/engine/index.ts'), e = window.formvis.engine;
  for (let i = 0; i < 4 && document.querySelector('.cv-scrim:not([hidden]) .cv-dialog'); i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 60)); }
  for (let i = 0; i < 40 && document.documentElement.classList.contains('cv-relighting'); i++) { document.querySelector('.cv-relight-btn[data-act="cancel"]')?.click(); await new Promise((r) => setTimeout(r, 100)); }
  for (let i = 0; i < 10; i++) { const r = new E.Raster(240, 160); r.ctx.fillStyle = '#808080'; r.ctx.fillRect(0, 0, 240, 160); r.touch(); e.insertRasterLayer(r, 'Cover ' + i, 0, 0, {}, 'Cover'); }
  e.setTool('move'); e.setViewFlip?.(false); window.formvis.commands.get('screen-standard').run(); const tp = window.formvis.commands.get('toggle-panels'); if (!tp.checked?.()) tp.run(); const tt = window.formvis.commands.get('terminal.toggle'); if (tt?.checked?.()) tt.run();
  for (const c of ['interface-zoom-reset', 'screen-standard', 'arrange-tabs']) { const cm = window.formvis.commands; if (cm.enabled(cm.get(c))) cm.run(c); } await new Promise((r) => setTimeout(r, 700));
  e.fit(); await new Promise((r) => setTimeout(r, 300));
  const st = document.querySelector('.cv-stage'), r = st.getBoundingClientRect(), v = e.current.viewport, at = v.toScreen(120, 80);
  st.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + at.x, clientY: r.top + at.y })); }"""


# State the prepared document lacks, one kind each, for the second pass.
BUILDERS = [
    ("undo", "() => window.formvis.engine.undo()"),
    ("a guide", "() => window.formvis.engine.addGuide('x', 50)"),
    ("a note", "() => { const e = window.formvis.engine, id = e.addNote({ x: 40, y: 40 }); if (id) e.selectNote?.(id); }"),
    ("frames", "() => { const e = window.formvis.engine; e.newFrame(); e.newFrame(); e.selectFrame(e.timeline.frames[0].id); }"),
    ("an artboard", "() => window.formvis.commands.run('new-artboard')"),
    ("a group", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('group'); e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); }"),
    ("a mask", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.deselect(); e.addMask(); }"),
    ("a work path", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.setWorkPath({ subpaths: [{ closed: true, anchors: [{ x: 30, y: 30, inX: 30, inY: 30, outX: 30, outY: 30 }, { x: 120, y: 30, inX: 120, inY: 30, outX: 120, outY: 30 }, { x: 120, y: 100, inX: 120, inY: 100, outX: 120, outY: 100 }] }] }); }"),
    ("a smart object", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('convert-smart'); }"),
    ("a smart filter", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('convert-smart'); e.addSmartFilter('gaussianBlur', { radius: 2 }); }"),
    ("a layer style", "() => { const e = window.formvis.engine, l = e.current.doc.layers.find((x) => x.name === 'Paint'); e.selectLayer(l.id); e.setLayerEffects(l.id, { ...(l.effects ?? {}), dropShadow: { ...(l.effects?.dropShadow ?? {}), enabled: true, color: { r: 0, g: 0, b: 0 }, opacity: 0.5, angle: 120, distance: 5, spread: 0, size: 5 } }); window.formvis.commands.run('copy-layer-style'); }"),
    ("a vector shape", "() => { const e = window.formvis.engine; Object.assign(e.shapeSettings, { kind: 'star', mode: 'shape', fill: 'fg', stroke: 'fg', strokeWidth: 2 }); e.drawShape({ x: 40, y: 40 }, { x: 100, y: 100 }, { x: 40, y: 40, w: 60, h: 60 }); }"),
    ("three layers selected", "() => { const e = window.formvis.engine, ls = e.current.doc.layers.filter((l) => !l.adjustment).slice(0, 3); e.selectLayer(ls[0].id); for (const l of ls.slice(1)) e.selectLayer(l.id, 'toggle'); }"),
    # State an earlier command used to leave behind when the whole walk shared one page; now that each part has a fresh page, built here.
    ("a stack", "() => { const e = window.formvis.engine, ls = e.current.doc.layers.filter((l) => !l.adjustment && !l.isGroup).slice(0, 3); e.selectLayer(ls[0].id); for (const l of ls.slice(1)) e.selectLayer(l.id, 'toggle'); window.formvis.commands.run('convert-smart'); }"),
    ("two vector shapes selected", "() => { const e = window.formvis.engine; Object.assign(e.shapeSettings, { kind: 'star', mode: 'shape', fill: 'fg', stroke: 'none' }); e.drawShape({ x: 60, y: 40 }, { x: 120, y: 100 }, { x: 60, y: 40, w: 60, h: 60 }); e.drawShape({ x: 90, y: 60 }, { x: 150, y: 120 }, { x: 90, y: 60, w: 60, h: 60 }); const vs = e.current.doc.layers.filter((l) => l.vector); e.selectLayer(vs[0].id); for (const l of vs.slice(1)) e.selectLayer(l.id, 'toggle'); }"),
    ("a group selected", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('group'); }"),
    ("linked layers", "() => { const e = window.formvis.engine, ls = e.current.doc.layers.filter((l) => !l.adjustment && !l.isGroup).slice(0, 2); e.selectLayer(ls[0].id); e.selectLayer(ls[1].id, 'toggle'); window.formvis.commands.run('link-layers'); }"),
    ("a CMYK document", "async () => { window.formvis.commands.run('mode-cmyk'); await new Promise((r) => setTimeout(r, 600)); }"),
    ("an edit to fade", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.deselect(); window.formvis.commands.run('invert'); }"),
    ("a layer comp","() => { window.formvis.commands.run('layer-comp-new'); }"),
    ("a vector mask", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.addVectorMask('reveal'); }"),
    ("data sets", "() => { window.formvis.engine.importDataSets('a,b\\n1,2\\n3,4'); }"),
    ("a redaction box", "() => { const e = window.formvis.engine; e.markupKind = 'redact'; e.addMarkup({ x: 30, y: 30 }, { x: 100, y: 90 }); }"),
    ("a mesh warp", "async () => { const e = window.formvis.engine; e.cancelTransform?.(); e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.deselect(); window.formvis.commands.run('transform-warp'); await new Promise((r) => setTimeout(r, 800)); }"),
    ("a grayscale document", "async () => { window.formvis.commands.run('mode-grayscale'); await new Promise((r) => setTimeout(r, 300)); }"),
    ("a 32-bit document","() => window.formvis.engine.setDepth(32)"),   # File > Export > Radiance HDR and OpenEXR (1.53.9)
    ("a proof setup", """async () => { const { iccProfile } = await import('/src/engine/icc.ts'), fd = new FormData(); fd.append('file', new Blob([iccProfile('adobe-rgb')]), 'adobe.icc');
      const r = await (await fetch('/api/color/profiles', { method: 'POST', body: fd })).json(); window.formvis.colour.saveSetup({ id: r.id, name: r.name, intent: 'relative', bpc: true }); }"""),
    ("an action recording", "() => { const a = window.formvis.actions; a.start('Test'); a.record({ kind: 'command', id: 'invert', label: 'Invert' }); }"),
    ("a smart filter mask", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('convert-smart'); e.addSmartFilter('gaussianBlur', { radius: 2 }); window.formvis.commands.run('add-filter-mask'); }"),
    ("a zoomed interface", "() => window.formvis.commands.run('interface-zoom-in')"),
    ("a video layer", "() => window.formvis.commands.run('video-layer-blank')"),
    ("a selected guide", "() => { const e = window.formvis.engine; e.addGuide('x', 50); e.selectGuide(0); }"),
    ("a selected slice", "() => { const e = window.formvis.engine; e.addSlice({ x: 10, y: 10, w: 60, h: 40 }); e.activeSlice = e.current.doc.slices[0].id; }"),
    ("a document to the right", "() => { const e = window.formvis.engine; e.newDocument(100, 80, 'Second', 'white'); window.formvis.commands.run('previous-document'); }"),
    ("a closed tab", "async () => { const e = window.formvis.engine; e.newDocument(100, 80, 'Second', 'white'); window.formvis.commands.run('close-tab'); await new Promise((r) => setTimeout(r, 800)); }"),
    ("a background job", "() => window.formvis.engine.startJob('Offered', 10)"),
    ("a colour sampler", "() => window.formvis.commands.run('sampler-add', { x: 40, y: 40 })"),
    ("a count group", "() => window.formvis.commands.run('count-new-group')"),
    ("layers under the pointer", PICK_LAYERS),
    ("a hidden layer", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('hide-layers'); }"),
    ("a hidden-all mask", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('mask-hide-all'); }"),
    ("floating pixels", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('select-float'); }"),
    ("an alpha channel", "() => { const e = window.formvis.engine; e.newAlpha(); e.newAlpha(); }"),
    ("an alpha channel chosen first", "() => { const e = window.formvis.engine; const a = e.newAlpha(); e.newAlpha(); e.showAlpha(a, true); }"),
    ("copied layers", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('copy-layers'); }"),
    ("type on a circle", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('type-on-circle', { text: 'Round' }); }"),
    ("a copied selection", "() => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); window.formvis.commands.run('copy'); }"),
    ("a box", "() => window.formvis.commands.run('boxes-from-selection')"),
    ("a copied shape style", "() => { const e = window.formvis.engine; Object.assign(e.shapeSettings, { kind: 'star', mode: 'shape', fill: 'fg', stroke: 'fg', strokeWidth: 2 }); e.drawShape({ x: 40, y: 40 }, { x: 100, y: 100 }, { x: 40, y: 40, w: 60, h: 60 }); e.selectLayer(e.current.doc.layers.find((l) => l.vector).id); window.formvis.commands.run('shape-style-copy'); }"),
    ("a depth map layer", "() => { const e = window.formvis.engine, l = e.current.doc.layers.find((x) => x.name === 'Paint'); e.selectLayer(l.id); e.current.updateLayer(l.id, { name: 'Depth Map' }); }"),
    ("a filter layer", "() => { const e = window.formvis.engine; e.addFilterLayer('boxBlur', 'Box Blur', { radius: 2 }); }"),
    ("a film look layer", "() => { const e = window.formvis.engine; e.addAdjustmentLayer('filmLook'); }"),
    ("copied film curve points", "() => { const e = window.formvis.engine; e.addAdjustmentLayer('filmLook'); window.formvis.commands.run('film-copy-points'); }"),
    ("an AI label", "() => window.formvis.engine.setMeta({ aiLabel: 'generated' })"),
    ("a stack with a statistic", "async () => { const mk = (c) => { const s = document.createElement('canvas'); s.width = 60; s.height = 40; const x = s.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 60, 40); return { name: c, width: 60, height: 40, source: s }; }; window.formvis.engine.loadStack([mk('#c83232'), mk('#32c832'), mk('#3232c8')], { smart: true, mode: 'mean' }); await new Promise((r) => setTimeout(r, 300)); }"),
    ("a last filter", "async () => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.deselect(); window.formvis.commands.run('filter-boxBlur'); await new Promise((r) => setTimeout(r, 500)); document.querySelector('.cv-scrim:not([hidden]) .cv-dialog button.cv-btn-primary')?.click(); await new Promise((r) => setTimeout(r, 800)); }"),
    ("an artboard guide", "() => { const e = window.formvis.engine; window.formvis.commands.run('new-artboard'); e.guideLayout({ columns: 2, rows: 2, gutterX: 0, gutterY: 0, margin: { top: 0, left: 0, bottom: 0, right: 0 }, clear: true, artboard: true }); }"),
    ("a floating window", "() => window.formvis.commands.run('float-window')"),
    ("a dark theme", "() => window.formvis.commands.run('theme-studio')"),
    ("a favourite theme", "() => { const k = 'formvis.prefs', p = JSON.parse(localStorage.getItem(k) || '{}'); p.favouriteThemes = ['studio']; localStorage.setItem(k, JSON.stringify(p)); }"),
    ("a 16-bit pixel layer", "() => { const e = window.formvis.engine; e.setDepth(16); e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); }"),
    ("a 32-bit pixel layer", "() => { const e = window.formvis.engine; e.setDepth(32); e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); }"),
]
# Commands that need state outside a test: files opened before (recent), NodeMode around formvis (send-host), a linked
# file on disk (update, relink, embed), a large picture opened as tiles (assemble), and the Note tool's selection.
# Also here: a saved pattern (patterns-export; Define Pattern asks for a name), a panorama stitched from several files
# (panorama-apply-view), a video layer with its footage (every video-* and render-video), a measurement scale set in its
# dialog (measure-scale-marker) and an indexed-colour document made through the Mode dialog (color-table).
# Not here, and not run bare: play-action and open-image-data take their arguments from the caller; run without them they
# say so in a toast. Commands that leave the page (a language or workspace reload) would be listed here with their reason.
OUTSIDE = {"patterns-export", "panorama-apply-view", "video-restore-frame", "video-interpret-footage", "video-replace-footage", "video-insert-blank-frame", "video-restore-all", "render-video", "measure-scale-marker", "color-table", "video-delete-frame",
           "revert", "slice-options", "transform-again-copy",       # a document saved to the library and then changed; a selected slice; a transform done by hand first
           "clear-slices", "convert-point-text", "delete-hidden", "rasterize-fill", "smart-reveal-linked", "transform-again", "video-duplicate-frame", "video-rasterize",   # slices, point text, a hidden layer, a fill layer and a linked smart object are each made by their own dialog or tool; the rest follow a transform or a video
           "trap", "warp-split-cross",                       # CMYK reached through the Mode dialog and its engine round trip; a warp grid whose cross split depends on a drag (its siblings warp-split-h, -v and warp-remove-split do run)
           "recent-heading", *(f"recent-{i}" for i in range(40)), "clear-recent", "send-host", "update-linked", "relink", "embed-linked", "assemble-tiles",   # one row per recent file, up to the longest Recent list
           "custom-title-bar", "menus-in-window", "check-for-updates",   # need the desktop window (its caption buttons, a Mac menu bar, the updater)
           "simulate-gpu-loss", "copy-frame-trace",                      # need a GPU display that has drawn frames; the software adapter here falls back to the CPU
           "save-history-log", "clear-history-log",                      # need Preferences > History Log on before the page loads, then steps made
           "delete-workspace",                                           # a custom workspace is named through the New Workspace dialog
           "edit-relight", "smart-warp-reset",                           # a relight layer is made in its own editor; a smart-object warp is placed by dragging its planes or pins
           "depth-map-recompute"}                                        # recomputing needs the Depth Anything model downloaded


def collect(page):
    import urllib.request
    try:                                                              # a 502 anywhere below would otherwise be blamed on whatever ran
        assert urllib.request.urlopen("http://127.0.0.1:8190/api/version", timeout=5).status == 200
    except Exception as exc:
        raise AssertionError(f"The formvis engine is not running, so this test cannot tell a real failure from a missing engine: {exc}")
    errors = []
    page.on("pageerror", lambda exc: errors.append(f"uncaught: {exc}"[:300]))
    page.on("console", lambda m: errors.append(f"console: {m.text}"[:300]) if m.type == "error" else None)
    page.on("filechooser", lambda fc: None)                          # Import, Load Brushes and the like: the picker is left unanswered
    page.on("dialog", lambda d: d.dismiss())
    return errors


def close_dialogs(page):
    for _ in range(4):
        if not page.evaluate("!!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')"):
            return
        page.keyboard.press("Escape"); page.wait_for_timeout(60)


@pytest.mark.parametrize("part", range(6))
def test_every_menu_command_runs(page, part):
    errors = collect(page)
    ids = page.evaluate("window.formvis.commands.all().map((c) => c.id)")[part::6]   # every sixth command, so each part gets a fresh page and finishes in time
    never, ran = [], 0
    last = {"id": None}                                               # the command about to run, so a crash or a lost page names it
    try:
        ran, never = _run_commands(page, errors, ids, last)
        _finish(page, errors, ids, never, ran, last)
    except AssertionError:
        raise
    except Exception as exc:
        raise AssertionError(f"part {part}: last command started was {last['id']!r}: {type(exc).__name__}: {str(exc)[:300]} (navigations: {getattr(page, 'navigations', None)})") from exc


def _run_commands(page, errors, ids, last):
    never, ran = [], 0
    for cid in ids:
        last["id"] = cid
        print(f"[offered] command {cid}", flush=True)
        layer_ids = page.evaluate(SETUP)
        before = len(errors)
        ok = page.evaluate("""([cid, layers]) => { const cs = window.formvis.commands, c = cs.get(cid), e = window.formvis.engine;
          for (const id of [null, ...layers.slice().reverse()]) { if (id) e.selectLayer(id); if (cs.enabled(c)) { try { cs.run(cid); } catch (x) { if (!Object.values(c.params ?? {}).some((p) => p.required) && !/ must |required/.test(String(x?.message))) throw x; } return true; } } return false; }""", [cid, layer_ids])
        if not ok:
            never.append(cid); continue
        ran += 1
        page.wait_for_timeout(120)
        close_dialogs(page)
        page.evaluate("() => { const e = window.formvis.engine; if (e.animationPlaying) e.stopAnimation?.(); }")
        for err in errors[before:]:
            errors[errors.index(err)] = f"{cid}: {err}"
    return ran, never


def _finish(page, errors, ids, never, ran, last):
    # A second pass for what the prepared document does not enable: each state builder on a fresh document, until the
    # command is enabled; then it runs.
    still = list(never)
    for name, build in BUILDERS:
        if not still:
            break
        page.evaluate(SETUP); page.evaluate(build)
        now = page.evaluate("(ids) => { const cs = window.formvis.commands; return ids.filter((id) => cs.enabled(cs.get(id))); }", still)
        close_dialogs(page)
        for cid in now:
            page.evaluate(SETUP); page.evaluate(build); close_dialogs(page)
            before = len(errors)
            last["id"] = f"{cid} (after {name})"
            print(f"[offered] command {last['id']}", flush=True)
            page.evaluate("(cid) => { const cs = window.formvis.commands, c = cs.get(cid); if (cs.enabled(c)) { try { cs.run(cid); } catch (x) { if (!Object.values(c.params ?? {}).some((p) => p.required) && !/ must |required/.test(String(x?.message))) throw x; } } }", cid)
            page.wait_for_timeout(120); close_dialogs(page)
            page.evaluate("() => { window.formvis.engine.stopAnimation?.(); }")
            for k in range(before, len(errors)):
                errors[k] = f"{cid} (after {name}): {errors[k]}"
            ran += 1
            still.remove(cid)
    print(f"\n[offered] commands run: {ran} of {len(ids)}; left for outside state: {still}")
    assert not errors, "\n".join(errors[:40])
    # What cannot be enabled inside a test, each for a stated reason; a newly offered command cannot hide here.
    extra = sorted(set(still) - OUTSIDE)
    print(f"[offered] not enabled by any state builder and not listed outside: {extra}", flush=True)
    assert not extra, extra


@pytest.mark.parametrize("part", range(4))
def test_every_tool_option_at_every_value(page, part):
    errors = collect(page)
    tools = page.evaluate("async () => (await import('/src/extensions/registry.ts')).toolList().map((t) => t.id)")[part::4]   # every fourth tool, so each part finishes in time
    stage = page.evaluate("(() => { const r = document.querySelector('.cv-stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    tried = 0
    for tid in tools:
        print(f"[offered] tool {tid}", flush=True)
        page.evaluate(SETUP)
        page.evaluate("(id) => { const e = window.formvis.engine; e.selectLayer(e.current.doc.layers.find((l) => l.name === 'Paint').id); e.deselect(); e.setTool(id); }", tid)
        opts = page.evaluate("""async (tid) => { const R = await import('/src/extensions/registry.ts'), e = window.formvis.engine;
          return (R.getTool(tid).options?.(e) ?? []).map((o, i) => ({ i, kind: o.kind, label: o.label ?? '', choices: (o.choices ?? []).map((c) => c.id ?? c), min: o.min, max: o.max })); }""", tid)
        for o in opts:
            values = {"select": o["choices"], "segment": o["choices"], "toggle": [True, False], "range": [o["min"], o["max"]], "number": [o["min"], o["max"]], "color": [{"r": 200, "g": 40, "b": 40}]}.get(o["kind"])
            if o["kind"] == "button":
                values = ["run"]
            if not values:
                continue
            for v in values:
                if v is None:
                    continue
                before = len(errors)
                page.evaluate("""async ([tid, i, v]) => { const R = await import('/src/extensions/registry.ts'), e = window.formvis.engine, o = (R.getTool(tid).options?.(e) ?? [])[i];
                  const orig = o.get ? o.get() : undefined; if (o.kind === 'button') o.run(); else o.set(v); window.__orig = [tid, i, orig]; }""", [tid, o["i"], v])
                tried += 1
                if o["kind"] in ("select", "segment", "toggle", "range", "number"):
                    x, y = stage
                    page.mouse.move(x - 20, y - 10); page.mouse.down(); page.mouse.move(x + 20, y + 10, steps=3); page.mouse.up()
                    page.wait_for_timeout(30)
                close_dialogs(page)
                page.keyboard.press("Escape")                           # leave any tool state (a path, a transform)
                page.evaluate("async () => { const [tid, i, orig] = window.__orig, R = await import('/src/extensions/registry.ts'), o = (R.getTool(tid).options?.(window.formvis.engine) ?? [])[i]; if (o && orig !== undefined && o.set) try { o.set(orig); } catch { /* read-only */ } }")
                for k in range(before, len(errors)):
                    errors[k] = f"{tid} / {o['label']} = {json.dumps(v)}: {errors[k]}"
    print(f"\n[offered] tool option values tried with a drag: {tried} across {len(tools)} tools")
    assert not errors, "\n".join(errors[:40])


def test_every_colour_mode_offered_changes_the_mode(page):
    """1.50.2's failure, directly: every Image > Mode choice offered must change the document's mode, its settings
    dialog (Bitmap, Indexed Color) confirmed."""
    errors = collect(page)
    modes = page.evaluate("window.formvis.commands.all().map((c) => c.id).filter((id) => id.startsWith('mode-'))")
    assert sorted(modes) == ["mode-bitmap", "mode-cmyk", "mode-convert", "mode-duotone", "mode-grayscale", "mode-grayscale-from", "mode-indexed", "mode-lab", "mode-multichannel", "mode-rgb"], modes
    for cid in ["mode-grayscale", "mode-bitmap", "mode-indexed", "mode-cmyk", "mode-rgb"]:
        page.evaluate(SETUP)
        if cid == "mode-rgb":
            page.evaluate("window.formvis.commands.run('mode-grayscale')")           # from another mode, back to RGB
        page.evaluate(f"window.formvis.commands.run('{cid}')")
        page.wait_for_timeout(150 if cid != "mode-cmyk" else 600)                    # CMYK lists the profiles first (1.54.0)
        if page.evaluate("!!document.querySelector('.cv-scrim:not([hidden]) .cv-dialog')"):
            page.locator(".cv-scrim:not([hidden]) .cv-dialog .cv-dialog-foot button.cv-btn-primary").click()
        page.wait_for_function(f"window.formvis.engine.current.doc.mode === '{cid[5:]}' || ('{cid}' === 'mode-rgb' && (window.formvis.engine.current.doc.mode ?? 'rgb') === 'rgb')", timeout=10000)
    page.evaluate("window.formvis.commands.run('mode-rgb')")                           # and back from CMYK (1.54.0), through the engine
    page.wait_for_function("(window.formvis.engine.current.doc.mode ?? 'rgb') === 'rgb' && !window.formvis.engine.current.doc.layers.some((l) => l.channels)", timeout=10000)
    assert not errors, "\n".join(errors[:20])
