# The largest document follows the machine's memory (1.53.4): the window takes the engine's budget and says it.
from e2e.conftest import open_app


def test_the_window_takes_the_engines_budget(context):
    page = context.new_page()
    def caps(route, request):
        r = route.fetch(); body = r.json(); body["pixelBudget"] = 200_000_000
        route.fulfill(response=r, json=body)
    page.route("**/api/capabilities", caps)                                                   # a 200-megapixel machine stood in for
    open_app(page)
    page.wait_for_function("async () => (await import('/src/engine/types.ts')).LIMITS.pixels === 200000000", timeout=15000)
    page.evaluate("window.formvis.commands.run('settings')")
    try:
        page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Performance").first.click()
        assert "Largest document: 200 megapixels" in page.locator(".cv-budget-note").inner_text()
    finally:
        page.close()   # a page left open with Preferences shares saved settings with the tests after it
