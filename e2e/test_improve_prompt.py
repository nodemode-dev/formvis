# Improve Prompt (1.51.5), against a stand-in OpenAI-compatible service, through Preferences and a generation dialog.
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


@pytest.fixture()
def service():
    seen = {"bodies": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(obj).encode())

        def do_GET(self):
            self._reply(200, {"data": [{"id": "llama3.2"}, {"id": "qwen2.5"}]})

        def do_POST(self):
            seen["bodies"].append(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)))))
            self._reply(200, {"choices": [{"message": {"content": "A red kite over a stormy sea at dusk"}}]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1", seen
    server.shutdown()


def test_set_up_in_preferences_then_improve_and_restore(page, service):
    url, seen = service
    page.evaluate("localStorage.removeItem('formvis.promptTemplates')")
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    page.locator("input[aria-label='Language model address']").fill(url)
    page.locator("input[aria-label='Language model']").fill("llama3.2")
    page.locator("input[aria-label='Language model key']").fill("sk-test")
    page.locator(f"{DLG} .cv-llm button", has_text="Check").click()
    page.wait_for_function("() => document.querySelector('.cv-llm-note').textContent.includes('Answering, with 2 models')")
    page.locator(f"{DLG} .cv-templates button", has_text="New").click()
    page.locator("input[aria-label='Template name']").fill("Stormy")
    page.locator("textarea[aria-label='Template text']").fill("Make it stormy and dramatic.")
    page.locator(f"{DLG} .cv-templates button", has_text="Save").click()
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'P', 'white'); window.formvis.commands.run('generate-image')")
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a kite")
    page.locator(f"{DLG} select[aria-label='Prompt template']").select_option("Stormy")
    page.locator(f"{DLG} .cv-improve button", has_text="Improve").click()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) textarea[aria-label=Prompt]').value === 'A red kite over a stormy sea at dusk'")
    assert seen["bodies"][-1]["messages"][0]["content"].startswith("Make it stormy and dramatic.") and (lambda c: c if isinstance(c, str) else c[0]["text"])(seen["bodies"][-1]["messages"][1]["content"]) == "a kite"
    page.locator(f"{DLG} .cv-improve button", has_text="Revert").click()
    assert page.locator(f"{DLG} textarea[aria-label='Prompt']").input_value() == "a kite"
    page.keyboard.press("Escape")
    page.evaluate("localStorage.removeItem('formvis.promptTemplates')")
