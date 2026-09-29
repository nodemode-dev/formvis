# Preferences > Plugins > Local models (1.52.9), against the real engine; only the download is stood in for (a real
# Krea 2 is 18 GB). The licence consent recorded is removed afterwards.
import json
import os
import struct
import urllib.request
from pathlib import Path

DLG = ".cv-scrim:not([hidden]) .cv-dialog"
SEC = f"{DLG} .cv-local-models"


def test_local_models_licence_install_and_loras(page, tmp_path):
    consent = Path(os.environ.get("FORMVIS_MODELS_DIR", str(Path.home() / ".cache/formvis-models"))) / "krea-2-consent.json"
    consent.unlink(missing_ok=True)
    polls = {"n": 0}

    def job(route, request):
        polls["n"] += 1
        route.fulfill(json={"status": "running", "progress": 0.5, "message": "Downloading Krea 2"} if polls["n"] == 1 else {"status": "done", "result": {}})
    page.route("**/api/models/krea-2/install", lambda route, request: route.fulfill(status=202, json={"job_id": "kj"}))
    page.route("**/api/jobs/kj", job)
    try:
        page.evaluate("window.formvis.commands.run('settings')")
        page.locator(".cv-prefs-nav button, .cv-prefs-nav [role='tab']", has_text="Plugins").first.click()
        krea = page.locator(f"{SEC} [data-model='krea-2']")
        krea.locator(".cv-local-state").wait_for(timeout=15000)
        assert "has not been accepted" in krea.locator(".cv-local-state").inner_text()
        install = krea.get_by_role("button", name="Install Krea 2")
        assert install.is_disabled() and krea.locator(".cv-local-summary li").count() >= 2
        assert krea.locator("a", has_text="The licence").get_attribute("href").startswith("https://www.krea.ai/")
        krea.locator("input[aria-label='Accept the Krea 2 licence']").check()
        page.wait_for_function("() => !document.querySelector('.cv-local-models [data-model=\"krea-2\"] button.cv-btn-primary').disabled")
        assert json.loads(urllib.request.urlopen("http://127.0.0.1:8190/api/models/krea-2/status").read())["licenceAccepted"] is True   # recorded in the engine
        krea.get_by_role("button", name="Install Krea 2").click()
        page.wait_for_function("() => document.querySelector('.cv-local-models [data-model=\"krea-2\"] .cv-local-note').textContent.includes('(50%)')")
        page.wait_for_function("() => document.querySelector('.cv-local-models [data-model=\"krea-2\"] .cv-local-note').textContent.includes('Installed')")
        klein = page.locator(f"{SEC} [data-model='klein']")
        assert "Apple silicon" in klein.locator(".cv-local-state").inner_text()                     # why it cannot run here
        assert klein.locator("select option").all_inner_texts() == ["8-bit MLX", "4-bit MLX"]
        # A tiny real LoRA: one lora_A and lora_B pair (formcut's check reads the header for LoRA tensors).
        tensors = {"transformer_blocks.0.attn.to_q.lora_A.weight": {"dtype": "F16", "shape": [1, 4], "data_offsets": [0, 8]},
                   "transformer_blocks.0.attn.to_q.lora_B.weight": {"dtype": "F16", "shape": [4, 1], "data_offsets": [8, 16]}, "__metadata__": {"format": "pt"}}
        header = json.dumps(tensors).encode(); header += b" " * (-len(header) % 8)
        lora = tmp_path / "tiny style.safetensors"; lora.write_bytes(struct.pack("<Q", len(header)) + header + b"\x00" * 16)
        lib = page.locator(f"{SEC} [data-model='loras']")
        lib.locator("input[aria-label='LoRA file']").set_input_files(str(lora))
        lib.locator(".cv-plugins-row", has_text="tiny style").wait_for(timeout=10000)
        lib.locator(".cv-plugins-row", has_text="tiny style").get_by_role("button", name="Remove").click()
        lib.locator("text=No LoRAs yet.").wait_for(timeout=10000)
    finally:
        consent.unlink(missing_ok=True)
