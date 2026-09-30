"""The largest document follows the machine's memory (1.53.4): a pixel per 40 bytes, 100 to 250 megapixels."""

from app.core import config

GB = 1024 ** 3


def test_the_budget_from_memory():
    assert config.pixel_budget(3 * GB) == 100_000_000             # never below formvis's old cap
    assert config.pixel_budget(4 * GB) == 4 * GB // 40              # 4 GB: about 107 megapixels
    assert config.pixel_budget(8 * GB) == 8 * GB // 40              # about 215 megapixels
    assert config.pixel_budget(16 * GB) == 250_000_000              # never past a browser's canvas area
    assert config.pixel_budget(0) == 100_000_000                     # memory unknown
    assert config.total_memory() > 0


def test_capabilities_report_the_budget(client):
    c = client.get("/api/capabilities").json()
    assert c["pixelBudget"] == config.MAX_PIXELS and c["memory"] == config.total_memory()
