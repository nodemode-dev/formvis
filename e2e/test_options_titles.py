def test_every_tool_options_bar_is_titled_with_the_tool(page):
    page.evaluate("window.formvis.engine.newDocument(200, 100, 'T', 'white')")
    wrong = page.evaluate("""async () => {
      const { toolList } = await import('/src/extensions/registry.ts'), e = window.formvis.engine, out = [];
      // A copy of the registry with no tools in it (a hot-reloaded server gives the test its own) would pass vacuously.
      if (toolList().length < 25) return [['tools seen', toolList().length]];
      for (const t of toolList()) {
        e.setTool(t.id);
        await new Promise((r) => requestAnimationFrame(() => r()));
        const g = document.querySelector('.cv-opt-group:not([hidden])'), title = g && g.querySelector('.cv-opt-title');
        const first = g && g.firstElementChild;
        // The title is the tool's icon chip (1.48.0, the target's bar), named by its label and tooltip.
        if (!title || title.getAttribute('aria-label') !== t.label || title.title !== t.label || !title.querySelector('svg') || first !== title) out.push([t.id, title ? title.getAttribute('aria-label') : null]);
      }
      return out;
    }""")
    assert wrong == [], wrong
