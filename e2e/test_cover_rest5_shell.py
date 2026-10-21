DIALOG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_status_line_progress_bar_shows_steps_and_percent_in_a_fixed_slot_without_moving_the_bar(page):
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'S', 'white')")
    page.wait_for_timeout(500)
    still = page.evaluate("() => { const b = document.querySelector('.cv-st-bar'); return b ? JSON.stringify(b.getBoundingClientRect()) : null; }")
    assert still
    seen = page.evaluate("""async () => {
      const e = window.formvis.engine, b = document.querySelector('.cv-st-bar');
      const out = {};
      await e.task(async () => {
        await e.task(async () => {});
        e.reportProgress(1, 4);
        await new Promise((r) => setTimeout(r, 50));
        out.now = b.getAttribute('aria-valuenow');
        out.text = b.parentElement.innerText;
        out.rect = JSON.stringify(b.getBoundingClientRect());
      });
      out.after = JSON.stringify(b.getBoundingClientRect());
      out.end = b.getAttribute('aria-valuenow');
      return out;
    }""")
    assert seen["now"] not in (None, "0") and int(seen["now"]) > 0
    assert "of 2" in seen["text"] and "25%" in seen["text"]
    assert seen["rect"] == still == seen["after"]
    assert seen["end"] == "0"


def test_jobs_list_shows_each_job_and_stop_cancels_only_that_job(page):
    page.evaluate("""() => { const e = window.formvis.engine; window.__jobs = [e.startJob('Alpha job', 10), e.startJob('Beta job', 10)]; e.jobStep(window.__jobs[0], 5, 10); window.__hold = new Promise((r) => { window.__release = r; }); void e.task(() => window.__hold); }""")
    page.wait_for_timeout(1500)
    page.evaluate("window.formvis.commands.run('jobs-list')")
    page.locator(".cv-jobs:not([hidden]) .cv-jobs-row").first.wait_for()
    rows = page.locator(".cv-jobs:not([hidden]) .cv-jobs-row")
    assert rows.count() == 2
    assert "Alpha job" in rows.nth(0).inner_text() and "50%" in rows.nth(0).inner_text()
    rows.nth(0).locator(".cv-jobs-stop").click()
    page.wait_for_timeout(300)
    assert page.evaluate("window.__jobs.map((j) => j.cancelled)") == [True, False]
    page.evaluate("() => { const e = window.formvis.engine; window.__jobs.forEach((j) => e.endJob(j)); window.__release(); }")
    assert page.evaluate("window.formvis.engine.jobs.length") == 0


def test_the_font_menu_groups_seventeen_bundled_families_in_five_categories_and_loads_a_face_on_demand(page):
    res = page.evaluate("""async () => {
      const E = await import('/src/engine/index.ts'), F = await import('/src/ui/fonts.ts');
      const groups = F.fontGroups().filter((g) => E.FONT_CATEGORIES.includes(g.label));
      const first = E.BUNDLED_FAMILIES[3].family;
      await E.ensureBundledFont(first);
      const listed = await window.formvis.commands.run('list-fonts');
      return { n: E.BUNDLED_FAMILIES.length, cats: E.FONT_CATEGORIES.length, grouped: groups.reduce((n, g) => n + g.families.length, 0), loaded: document.fonts.check('16px "' + first + '"'), first };
    }""")
    assert res["n"] == 17 and res["cats"] == 5 and res["grouped"] == 17 and res["loaded"] is True


def test_a_danger_question_dialog_is_themed_in_the_window_and_focuses_cancel_while_confirm_runs_the_action(page):
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'Q', 'white')")
    page.evaluate("() => { const e = window.formvis.engine; e.addLayer({ name: 'L2' }); e.fill('fg'); }")
    steps = "window.formvis.engine.current.history.steps.names.length"
    assert page.evaluate(steps) > 0
    page.evaluate("() => { void window.formvis.commands.run('purge-all'); }")
    page.locator(f"{DIALOG}-foot button.cv-btn-danger").last.wait_for()
    assert "Purge everything?" in page.locator(DIALOG).last.inner_text()
    assert page.evaluate("document.activeElement.textContent.trim()") == "Cancel"
    page.locator(f"{DIALOG}-foot button.cv-btn-danger").last.click()
    page.wait_for_timeout(500)
    assert page.evaluate(steps) == 0


def test_the_type_preferences_page_has_no_text_engine_control(page):
    page.evaluate("window.formvis.engine.newDocument(40, 40, 'T', 'white')")
    page.evaluate("window.formvis.commands.run('prefs-type')")
    page.locator(DIALOG).last.wait_for()
    page.wait_for_timeout(600)
    text = page.locator(DIALOG).last.inner_text().lower()
    assert "text engine" not in text
    assert "preferences" in text
