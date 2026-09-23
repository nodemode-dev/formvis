def test_every_tool_options_bar_is_titled_with_the_tool(page):
    page.evaluate("window.sonny.engine.newDocument(200, 100, 'T', 'white')")
    wrong = page.evaluate("""async () => {
      const { toolList } = await import('/src/extensions/registry.ts'), e = window.sonny.engine, out = [];
      for (const t of toolList()) {
        e.setTool(t.id);
        await new Promise((r) => requestAnimationFrame(() => r()));
        const g = document.querySelector('.cv-opt-group:not([hidden])'), title = g && g.querySelector('.cv-opt-title');
        const first = g && g.firstElementChild;
        if (!title || title.textContent.trim() !== t.label || first !== title) out.push([t.id, title ? title.textContent.trim() : null]);
      }
      return out;
    }""")
    assert wrong == [], wrong
