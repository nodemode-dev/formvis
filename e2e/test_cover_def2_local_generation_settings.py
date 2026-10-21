# D40: the prompt, seed, steps and LoRAs of a local generation are read from the job's record before the engine's copy
# of the picture and its record are deleted, so they can sit on the placed layer. The engine is mocked (route handlers); no model runs.
import io
import json

from PIL import Image

RUN = """async () => {
  const L = await import('/src/io/local-gen.ts');
  const r = await L.runLocal({ generator: 'local:test', prompt: 'a red fox' });
  return { n: r.pictures.length, settings: r.settings[0] || null };
}"""


def png():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 40, 40)).save(buf, "PNG")
    return buf.getvalue()


def test_generation_settings_are_taken_from_the_record_before_the_engine_copy_is_deleted(page):
    calls = []
    record = {"url": "/api/generate/media/fox.png", "prompt": "a red fox", "seed": 4242, "steps": 12, "guidance": 3.5, "loras": [{"file": "style.safetensors", "scale": 0.7}]}

    def generate(route):
        calls.append("POST generate")
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"job_id": "j1"}))

    def job(route):
        calls.append(route.request.method + " job")
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "done", "result": {"media": [record]}}))

    def media(route):
        calls.append(route.request.method + " media")
        if route.request.method == "DELETE":
            route.fulfill(status=200, content_type="application/json", body="{}")
        else:
            route.fulfill(status=200, content_type="image/png", body=png())

    page.route("**/api/generate", generate)
    page.route("**/api/jobs/j1", job)
    page.route("**/api/generate/media/fox.png", media)
    got = page.evaluate(RUN)
    page.wait_for_timeout(300)
    assert got["n"] == 1
    s = got["settings"]
    assert s["prompt"] == "a red fox" and s["seed"] == 4242 and s["steps"] == 12 and s["guidance"] == 3.5
    assert s["loras"] == [{"file": "style.safetensors", "scale": 0.7}]
    assert calls.index("GET media") < calls.index("DELETE media")
