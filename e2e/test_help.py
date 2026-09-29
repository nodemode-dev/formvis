# Help > formvis Help (1.52.3): the manual in the app, searched, rendered safely, and asked.
import json
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DLG = ".cv-scrim:not([hidden]) .cv-dialog"


def test_f1_opens_the_manual_search_filters_and_text_stays_text(page):
    page.keyboard.press("F1")
    page.locator(DLG, has_text="formvis Help").wait_for()
    links = page.locator(f"{DLG} .cv-help-link").all_inner_texts()
    assert "ComfyUI" in links and "Exporting" in links and "The assistant and outside agents" in links
    page.locator(f"{DLG} input[aria-label='Search the manual']").fill("OpenRaster")
    shown = [t for t in page.locator(f"{DLG} .cv-help-link:visible").all_inner_texts()]
    assert "Exporting" in shown and "ComfyUI" not in shown, shown
    assert page.locator(f"{DLG} .cv-help-page code", has_text="./formvis boot").count() >= 1       # code spans rendered
    injected = page.evaluate("""async () => { const m = await import('/src/help/markdown.ts'), d = document.createElement('div');
      d.append(m.render('- <img src=x onerror="window.__pwned=1"> and **bold** and `x<b>y</b>`')); return [d.querySelectorAll('img, b').length, d.textContent.includes('<img src=x'), !!window.__pwned]; }""")
    assert injected == [0, True, False], injected                                                     # markup stays text


def test_ask_answers_from_the_manual(page):
    seen = []

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def do_GET(self):
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b'{"data": []}')

        def do_POST(self):
            seen.append(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)))))
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"content": "Use File > Send to ComfyUI with the selection."}}]}).encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/llm/settings", urllib.parse.urlencode({"base_url": f"http://127.0.0.1:{server.server_address[1]}/v1", "model": "stand-in"}).encode()), timeout=10)
        page.evaluate("window.formvis.commands.run('help')")
        page.locator(f"{DLG} input[aria-label='Ask the manual']").fill("How do I send the selection to ComfyUI?")
        page.locator(f"{DLG} button", has_text="Ask").click()
        page.wait_for_function("() => document.querySelector('.cv-scrim:not([hidden]) .cv-help-answer').textContent.includes('Send to ComfyUI with the selection')")
        assert "From: ComfyUI" in page.locator(f"{DLG} .cv-help-answer").inner_text()
        body = seen[-1]
        assert "tools" not in body and "## ComfyUI" in body["messages"][0]["content"] and "Load Image (as Mask)" in body["messages"][0]["content"]
        assert body["messages"][1] == {"role": "user", "content": "How do I send the selection to ComfyUI?"}
    finally:
        server.shutdown()
        urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8190/api/llm/settings", urllib.parse.urlencode({"base_url": "http://127.0.0.1:9/v1", "model": "none"}).encode()), timeout=10)
