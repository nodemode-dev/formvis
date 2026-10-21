"""Launch arguments that run something: --command <id>, --script <file> and --action <name> run in order after the
files of the same launch have opened (main.rs runs_from_args and take_pending_runs, io/disk.ts listenShell)."""
from .test_linux_desktop_open import documents, write_png


def sizes(app) -> list[tuple[int, int]]:
    return sorted((d["width"], d["height"]) for d in documents(app))


def test_a_command_in_the_arguments_runs_on_the_picture_opened_with_it(fresh, shots):
    picture = write_png(fresh.workdir / "wide.png", 96, 64, (30, 140, 220))
    fresh.launch(str(picture), "--command", "rotate-90-cw")
    found = fresh.wait_for(lambda: sizes(fresh) == [(64, 96)] and sizes(fresh), timeout=60, what="the picture to open and turn")
    assert found == [(64, 96)]
    fresh.screenshot("command-ran")


def test_a_script_file_runs_and_is_not_opened_as_a_document(fresh):
    picture = write_png(fresh.workdir / "small.png", 40, 30, (200, 30, 30))
    script = fresh.workdir / "turn.js"
    script.write_text("await run('rotate-90-cw', {});\nawait run('rotate-90-cw', {});\nawait run('rotate-90-cw', {});\n")
    fresh.launch(str(picture), "--script", str(script))
    found = fresh.wait_for(lambda: sizes(fresh) == [(30, 40)] and sizes(fresh), timeout=60, what="the script to turn the picture three times")
    assert found == [(30, 40)]
    assert len(documents(fresh)) == 1


def test_an_unknown_command_a_missing_script_and_a_missing_action_leave_the_launch_working(fresh):
    picture = write_png(fresh.workdir / "keep.png", 50, 20, (30, 200, 30))
    fresh.launch(str(picture), "--command", "no-such-command", "--script", str(fresh.workdir / "missing.js"), "--action", "No Such Action", "--command", "rotate-90-cw")
    # The three failures are notices; the last command still runs on the opened picture.
    found = fresh.wait_for(lambda: sizes(fresh) == [(20, 50)] and sizes(fresh), timeout=60, what="the last command to run after the failures")
    assert found == [(20, 50)] and len(documents(fresh)) == 1
    fresh.screenshot("failures-noted")
