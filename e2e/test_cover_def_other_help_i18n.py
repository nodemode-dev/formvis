# Help links, About and System Info, plural-aware translations, the right-to-left shell and the Arabic and Hindi tables.
LANG = "async (code) => { const m = await import('/src/ui/i18n.ts'); await m.setLanguage(code); return m; }"


def test_help_github_opens_the_project_page_in_a_new_tab(page):
    calls = page.evaluate("""() => { const calls = []; const o = window.open; window.open = (...a) => { calls.push(a.slice(0, 3)); return null; };
      window.formvis.commands.run('help-github'); window.open = o; return calls; }""")
    assert calls == [["https://github.com/nodemode-dev/formvis", "_blank", "noopener"]]


def test_report_issue_shows_a_dialog_holding_the_system_report(page):
    page.evaluate("window.formvis.commands.run('report-issue')")
    dialog = page.locator(".cv-dialog:visible")
    dialog.first.wait_for(timeout=8000)
    assert dialog.count() == 1
    text = dialog.first.inner_text().lower()
    assert "issue" in text or "report" in text
    assert any(ta.input_value().strip() for ta in dialog.first.locator("textarea").all()) or len(text) > 60
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelectorAll('.cv-dialog').length === 0 || ![...document.querySelectorAll('.cv-dialog')].some(d => d.offsetParent)", timeout=5000)


def test_about_and_system_info_answer(page):
    page.evaluate("window.formvis.commands.run('about')")
    dialog = page.locator(".cv-dialog:visible")
    dialog.first.wait_for(timeout=8000)
    assert "formvis" in dialog.first.inner_text().lower()
    page.keyboard.press("Escape")
    info = page.evaluate("window.formvis.commands.run('system-info', { show: false })")
    assert info and (isinstance(info, str) and len(info) > 20 or info is True)


def test_arabic_flips_the_shell_and_translates_the_menus_and_hindi_does_not_flip(page):
    rail_en = page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().x")
    page.evaluate(LANG, "ar")
    assert page.evaluate("[document.documentElement.dir, document.documentElement.lang]") == ["rtl", "ar"]
    assert page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().x") > rail_en + 500
    menus = page.evaluate("[...document.querySelectorAll('.cv-menubar *')].map(e => e.textContent.trim()).filter(Boolean)")
    assert "مساعدة" in menus and "ملف" in menus and "File" not in menus
    page.evaluate(LANG, "hi")
    assert page.evaluate("document.documentElement.dir") == "ltr"
    assert page.evaluate("(async () => { const m = await import('/src/ui/i18n.ts'); return [m.t('Help'), m.t('Layers')]; })()") == ["सहायता", "लेयर"]
    page.evaluate(LANG, "en")
    assert page.evaluate("document.documentElement.dir") == "ltr"
    assert abs(page.evaluate("document.querySelector('.cv-rail').getBoundingClientRect().x") - rail_en) < 2


def test_plural_forms_follow_each_languages_rules(page):
    def forms(code, ns):
        return page.evaluate("async ([code, ns]) => { const m = await import('/src/ui/i18n.ts'); await m.setLanguage(code); return ns.map((n) => m.tn(n, '{n} record.', '{n} records.')); }", [code, ns])

    assert forms("en", [1, 2]) == ["1 record.", "2 records."]
    assert forms("ru", [1, 2, 5, 21]) == ["1 запись.", "2 записи.", "5 записей.", "21 запись."]
    assert forms("ar", [2])[0] == "سجلان."
    page.evaluate(LANG, "en")
