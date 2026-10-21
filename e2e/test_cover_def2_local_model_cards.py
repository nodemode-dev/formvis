# D36: Preferences > Local models has a Sky segmentation card that downloads (or, once installed, removes) the model Select > Sky uses.
# D39: the same panel has a MoGe-2 card for Relight's depth model. The section is built on its own and read; no download is started.
SECTION = """async () => {
  const M = await import('/src/ui/panels/local-models.ts');
  const s = new M.LocalModelsSection();
  document.body.appendChild(s.el);
  await s.refresh();
  for (let i = 0; i < 40 && !s.el.querySelector('[data-model=skyseg] button'); i++) await new Promise((r) => setTimeout(r, 250));
  const card = (sel) => { const c = s.el.querySelector(sel); return c ? { text: c.innerText, buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null; };
  const out = { sky: card('[data-model=skyseg]'), moge: card('[data-model=moge-2-vits-normal]') || [...s.el.querySelectorAll('.cv-local-card')].map((c) => ({ text: c.innerText, buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) })).find((c) => /MoGe-2/.test(c.text)) || null };
  s.el.remove();
  return out;
}"""


def test_sky_and_moge_cards_offer_install_or_remove(page):
    got = page.evaluate(SECTION)
    sky = got["sky"]
    assert sky is not None and "Sky segmentation" in sky["text"]
    assert any(b in ("Download the sky model", "Remove") for b in sky["buttons"])
    moge = got["moge"]
    assert moge is not None and "MoGe-2" in moge["text"]
    assert any(b.startswith("Download MoGe-2") or b == "Remove" for b in moge["buttons"])
