"""1.95.7: the desktop engine is a PyInstaller bundle, where data files sit under sys._MEIPASS rather than beside the code.
1.95.6 read the fal catalogue beside the code at import time, so the bundle (which left the file out) failed to start.
The catalogue is now found under _MEIPASS when frozen, the freeze scripts bundle it, and a missing one is an empty list."""
from pathlib import Path

from app.services import fal_run

ROOT = Path(__file__).resolve().parents[2]


def test_a_missing_catalogue_is_an_empty_list_not_a_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(fal_run, "CATALOGUE", tmp_path / "nowhere.json")
    fal_run._catalogue.cache_clear()
    try:
        assert fal_run.models() == []
        assert fal_run.listing()["models"] == []
    finally:
        fal_run._catalogue.cache_clear()


def test_a_damaged_catalogue_is_an_empty_list(tmp_path, monkeypatch):
    bad = tmp_path / "fal_models.json"
    bad.write_text("{not json")
    monkeypatch.setattr(fal_run, "CATALOGUE", bad)
    fal_run._catalogue.cache_clear()
    try:
        assert fal_run.models() == []
    finally:
        fal_run._catalogue.cache_clear()


def test_the_freeze_scripts_bundle_every_data_folder_the_engine_reads():
    for script in ("setup/freeze_backend", "setup/freeze_backend.bat"):
        text = (ROOT / script).read_text()
        assert "backend/app/data" in text.replace("\\", "/"), script
        assert "backend/app/profiles" in text.replace("\\", "/"), script


def test_the_bat_keeps_a_space_between_every_option():
    assert '"--add-data' not in (ROOT / "setup/freeze_backend.bat").read_text()


def test_the_catalogue_ships_beside_the_code():
    assert fal_run.CATALOGUE.parts[-2:] == ("data", "fal_models.json")
    assert fal_run.CATALOGUE.exists()
