# Carrying data across the rename (1.50.5): what the app saved under its former name is there after a restart, under
# formvis's names, and the former copies are gone. The former name is read from io/legacy.ts, never spelled here.
LEGACY = "import('/src/io/legacy.ts')"


def test_settings_and_databases_carry_across_a_restart(page):
    page.evaluate(f"""async () => {{ const L = await {LEGACY};
      localStorage.setItem(L.FORMER_PREFIX + 'carry.test', 'kept');                                   // a setting, as saved before
      await new Promise((ok) => {{ const r = indexedDB.open(L.FORMER_DATABASES[0], 1);                 // an imported brush, as saved before
        r.onupgradeneeded = () => r.result.createObjectStore('presets');
        r.onsuccess = () => {{ const tx = r.result.transaction('presets', 'readwrite'); tx.objectStore('presets').put([{{ name: 'Carried' }}], 'imported'); tx.oncomplete = () => {{ r.result.close(); ok(); }}; }}; }}); }}""")
    page.reload(); page.wait_for_function("window.formvis && window.formvis.engine")
    got = page.evaluate(f"""async () => {{ const L = await {LEGACY};
      const names = (await indexedDB.databases()).map((d) => d.name);
      const brush = await new Promise((ok) => {{ const r = indexedDB.open('formvis-brushes'); r.onsuccess = () => {{ const q = r.result.transaction('presets').objectStore('presets').get('imported'); q.onsuccess = () => {{ r.result.close(); ok(q.result); }}; }}; }});
      return [localStorage.getItem('formvis.carry.test'), localStorage.getItem(L.FORMER_PREFIX + 'carry.test'), names.includes(L.FORMER_DATABASES[0]), brush]; }}""")
    assert got == ["kept", None, False, [{"name": "Carried"}]], got
    page.evaluate("localStorage.removeItem('formvis.carry.test')")


def test_projects_with_the_former_extensions_are_recognised(page):
    ok = page.evaluate(f"""async () => {{ const L = await {LEGACY}, I = await import('/src/io/images.ts');
      return L.FORMER_PROJECT_EXTENSIONS.map((x) => I.isProjectFile(new File([''], 'Trip' + x))).concat([I.isProjectFile(new File([''], 'Trip.fmv')), I.PROJECT_ACCEPT.startsWith('.fmv')]); }}""")
    assert ok == [True, True, True, True], ok
