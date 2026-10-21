"""PC-EN-0511, PC-AU-0148: the native renderer's graphics API (Preferences > Performance) is written by the desktop shell
to $XDG_CONFIG_HOME/formvis/graphics-backend and set as WGPU_BACKEND, which wgpu reads, at the next launch; a value
already in the environment is kept. The web process is the shell's child, so its environment shows what the shell set."""
from pathlib import Path

from e2e.desktop.test_linux_desktop_display import open_preferences, preference, web_environment


def backend_file(app) -> Path:
    return app.home / ".config" / "formvis" / "graphics-backend"


def test_the_choice_is_written_and_offers_the_linux_apis(fresh):
    fresh.launch()
    open_preferences(fresh)
    shown = fresh.ok("ui_dialog", {"action": "list"})
    field = next(f for d in shown["dialogs"] for f in d["fields"] if f["field"].startswith("Native Renderer Graphics API"))
    assert field["options"] == ["Automatic", "Vulkan", "OpenGL"]
    for choice, kept in (("OpenGL", "gl"), ("Vulkan", "vulkan"), ("Automatic", "auto")):
        preference(fresh, "Native Renderer Graphics API", choice)
        fresh.wait_for(lambda: backend_file(fresh).exists() and backend_file(fresh).read_text() == kept, timeout=20, what=f"{kept} kept in graphics-backend")


def test_a_kept_choice_is_set_for_the_renderer_at_the_next_launch(fresh):
    backend_file(fresh).parent.mkdir(parents=True, exist_ok=True)
    backend_file(fresh).write_text("gl")
    fresh.launch()
    assert web_environment(fresh).get("WGPU_BACKEND") == "gl"


def test_automatic_sets_nothing_and_the_environment_wins(fresh):
    backend_file(fresh).parent.mkdir(parents=True, exist_ok=True)
    backend_file(fresh).write_text("auto")
    fresh.launch()
    assert "WGPU_BACKEND" not in web_environment(fresh)
    fresh.stop()
    backend_file(fresh).write_text("gl")
    fresh.launch(extra_env={"WGPU_BACKEND": "vulkan"})
    assert web_environment(fresh).get("WGPU_BACKEND") == "vulkan"
