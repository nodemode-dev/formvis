# Improve Prompt use cases (SC-ED-0230, SC-AI-0112): each use case picks its starter template and tells the model what the prompt is for.
# A stand-in OpenAI-compatible service answers with the system prompt it received.
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

DLG = ".cv-scrim:not([hidden]) .cv-dialog"

CASES = [
    ("Generate a new picture", "You rewrite prompts for making a new picture from nothing.", "making a new picture from nothing"),
    ("Fill a selection", "You rewrite prompts for filling a selected area", "filling a selected area of an existing picture"),
    ("Edit instruction", "You rewrite prompts that tell an image model how to change", "an instruction that changes an existing picture"),
    ("Photographic", "You rewrite prompts for a photographic picture.", "a photographic picture"),
    ("Tag list", "You rewrite prompts as a list of short tags", "a model that reads a list of tags"),
    ("Transparent asset", "You rewrite prompts for a single object that will be cut out", "an object to be cut out and placed on other pictures"),
]


@pytest.fixture()
def service():
    seen = {"bodies": []}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _reply(self, code, obj):
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(obj).encode())

        def do_GET(self):
            self._reply(200, {"data": [{"id": "stub-model"}]})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            seen["bodies"].append(body)
            self._reply(200, {"choices": [{"message": {"content": "Echo: " + body["messages"][0]["content"]}}]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1", seen
    server.shutdown()


def test_each_use_case_sends_its_template_and_purpose(page, service):
    url, seen = service
    page.evaluate("localStorage.removeItem('formvis.promptTemplates')")
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    page.locator("input[aria-label='Language model address']").fill(url)
    page.locator("input[aria-label='Language model']").fill("stub-model")
    page.locator("input[aria-label='Language model key']").fill("sk-test")
    page.locator(f"{DLG} .cv-llm button", has_text="Check").click()
    page.wait_for_function("() => document.querySelector('.cv-llm-note').textContent.includes('Answering')")
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'P', 'white'); window.formvis.commands.run('generate-image')")
    use = page.locator(f"{DLG} select[aria-label='Prompt use']")
    template = page.locator(f"{DLG} select[aria-label='Prompt template']")
    field = page.locator(f"{DLG} textarea[aria-label='Prompt']")
    use_node = use.element_handle()
    for label, starter, purpose in CASES:
        field.fill("a kite over the sea")
        use.select_option(label=label)
        assert template.input_value() == label
        before = len(seen["bodies"])
        page.locator(f"{DLG} .cv-improve button", has_text="Improve").click()
        page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) textarea[aria-label=Prompt]').value.startsWith('Echo: ')")
        assert len(seen["bodies"]) == before + 1
        system = seen["bodies"][-1]["messages"][0]["content"]
        assert system.startswith(starter) and f"The prompt is for {purpose}." in system
        assert starter in field.input_value()
        restore = page.locator(f"{DLG} .cv-improve button", has_text="Restore")
        assert restore.is_visible()
        restore.click()
        assert field.input_value() == "a kite over the sea"
    assert use.element_handle().evaluate("(a, b) => a === b", use_node)
    page.keyboard.press("Escape")
    page.evaluate("localStorage.removeItem('formvis.promptTemplates')")


def test_any_use_adds_no_purpose(page, service):
    url, seen = service
    page.evaluate("localStorage.removeItem('formvis.promptTemplates')")
    page.evaluate("window.formvis.commands.run('settings')")
    page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
    page.locator("input[aria-label='Language model address']").fill(url)
    page.locator("input[aria-label='Language model']").fill("stub-model")
    page.locator("input[aria-label='Language model key']").fill("sk-test")
    page.locator(f"{DLG} .cv-llm button", has_text="Check").click()
    page.wait_for_function("() => document.querySelector('.cv-llm-note').textContent.includes('Answering')")
    page.keyboard.press("Escape")
    page.evaluate("window.formvis.engine.newDocument(80, 60, 'P', 'white'); window.formvis.commands.run('generate-image')")
    page.locator(f"{DLG} textarea[aria-label='Prompt']").fill("a kite")
    page.locator(f"{DLG} .cv-improve button", has_text="Improve").click()
    page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) textarea[aria-label=Prompt]').value.startsWith('Echo: ')")
    assert "The prompt is for" not in seen["bodies"][-1]["messages"][0]["content"]
    page.keyboard.press("Escape")
