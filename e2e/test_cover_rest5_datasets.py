import zipfile


def test_export_data_sets_as_files_names_each_file_from_the_template_and_numbers_them(page):
    page.evaluate("() => { const e = window.formvis.engine; e.newDocument(30, 20, 'Cards', 'white'); e.importDataSets('title,note\\nAlpha,one\\nBeta,two\\nGamma,three\\n'); }")
    assert page.evaluate("window.formvis.engine.current.doc.dataSets.length") == 3
    with page.expect_download(timeout=60000) as dl:
        page.evaluate("window.formvis.commands.run('export-data-sets', { format: 'png', template: '{document}-{index}-{name}' })")
    names = sorted(zipfile.ZipFile(dl.value.path()).namelist())
    assert len(names) == 3 and all(n.endswith(".png") for n in names), names
    assert all(n.startswith("Cards-") for n in names), names
    assert any("Alpha" in n for n in names) and any("Gamma" in n for n in names), names
    assert len({n.split("-")[1] for n in names}) == 3, names
