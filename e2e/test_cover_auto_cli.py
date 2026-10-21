import json
import os
import subprocess
from pathlib import Path

from PIL import Image

REPO = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[1]))


def cli(*args, stdin=None):
    env = {**os.environ, "FORMVIS_URL": "http://127.0.0.1:8190"}
    return subprocess.run([str(REPO / "formvis"), "cli", *args], input=stdin, capture_output=True, text=True, timeout=90, env=env, cwd=REPO)


def pictures(tmp_path):
    out = []
    for name, colour in (("a", (200, 50, 50)), ("b", (50, 200, 50)), ("c", (50, 50, 200))):
        p = tmp_path / f"{name}.png"
        Image.new("RGB", (60, 40), colour).save(p)
        out.append(str(p))
    return out


def test_help_version_and_unknown_subcommand():
    h = cli("--help")
    assert h.returncode == 0 and "serve" in h.stdout and "droplet" in h.stdout and "process" in h.stdout
    v = cli("version")
    assert v.returncode == 0 and v.stdout.startswith("formvis ") and "engine" in v.stdout and "127.0.0.1:8190" in v.stdout
    bad = cli("bogus")
    assert bad.returncode == 2 and "the subcommands are" in bad.stderr + bad.stdout


def test_info_reads_a_file_without_a_window_and_refuses_a_missing_one(tmp_path):
    a, b, _ = pictures(tmp_path)
    j = json.loads(cli("info", a, "--json").stdout)
    assert (j["width"], j["height"], j["mode"], j["depth"], j["format"]) == (60, 40, "rgb", 8, "PNG")
    plain = cli("info", a, b)
    assert plain.returncode == 0 and "a.png: 60 x 40 px, rgb, 8 bit" in plain.stdout and "b.png: 60 x 40 px" in plain.stdout
    missing = cli("info", str(tmp_path / "nothing.png"))
    assert missing.returncode == 1 and "There is no file at" in missing.stderr + missing.stdout


def test_convert_writes_the_new_format_and_will_not_overwrite(tmp_path):
    a, b, _ = pictures(tmp_path)
    out = tmp_path / "a.jpg"
    r = cli("convert", a, str(out))
    assert r.returncode == 0 and out.exists() and Image.open(out).format == "JPEG" and Image.open(out).size == (60, 40)
    clash = cli("convert", a, b)
    assert clash.returncode == 1 and "already exists" in clash.stdout + clash.stderr
    assert Image.open(b).getpixel((5, 5)) == (50, 200, 50)


def test_stack_contact_and_fit_run_without_a_window(tmp_path):
    a, b, c = pictures(tmp_path)
    mean, med = tmp_path / "mean.png", tmp_path / "median.png"
    assert cli("stack", a, b, c, "--mode", "mean", "--out", str(mean)).returncode == 0
    assert cli("stack", a, b, c, "--out", str(med)).returncode == 0
    assert Image.open(mean).getpixel((5, 5)) == (100, 100, 100) and Image.open(med).getpixel((5, 5)) == (50, 50, 50)
    sheet = tmp_path / "sheet.png"
    r = cli("contact", a, b, c, "--out", str(sheet), "--width", "300", "--height", "200", "--unit", "px", "--ppi", "72", "--columns", "3", "--rows", "1", "--no-captions")
    assert r.returncode == 0 and Image.open(sheet).size == (300, 200)
    fit = tmp_path / "fit"
    assert cli("fit", a, "--width", "30", "--height", "30", "--out", str(fit)).returncode == 0
    assert Image.open(fit / "a.png").size == (30, 20)


def test_jobs_list_and_the_json_lines_session(tmp_path):
    assert cli("jobs", "list").returncode == 0
    a, _, _ = pictures(tmp_path)
    lines = [{"id": 1, "method": "version"}, {"id": 2, "method": "nope"}, {"id": 3, "method": "file.info", "params": {"path": a}}]
    r = cli("serve", stdin="\n".join(json.dumps(l) for l in lines) + "\nnot json\n")
    out = [json.loads(l) for l in r.stdout.splitlines()]
    assert out[0]["ok"] and out[0]["result"]["name"] == "formvis"
    assert not out[1]["ok"] and "No method nope" in out[1]["error"]
    assert out[2]["ok"] and out[2]["result"]["data"]["width"] == 60
    assert out[3]["id"] is None and not out[3]["ok"] and "one JSON object" in out[3]["error"]


def test_the_session_token_and_root_confine_what_a_client_may_do(tmp_path):
    a, _, _ = pictures(tmp_path)
    lines = [{"id": 1, "method": "version"},
             {"id": 2, "method": "version", "token": "sek"},
             {"id": 3, "method": "file.info", "params": {"path": "/etc/passwd"}, "token": "sek"},
             {"id": 4, "method": "file.info", "params": {"path": a}, "token": "sek"},
             {"id": 5, "method": "shutdown", "token": "sek"},
             {"id": 6, "method": "version", "token": "sek"}]
    r = cli("serve", "--token", "sek", "--root", str(tmp_path), stdin="\n".join(json.dumps(l) for l in lines) + "\n")
    out = {o["id"]: o for o in map(json.loads, r.stdout.splitlines())}
    assert not out[1]["ok"] and "needs its token" in out[1]["error"]
    assert out[2]["ok"]
    assert not out[3]["ok"] and "outside the session's root" in out[3]["error"]
    assert out[4]["ok"] and out[5]["result"] == {"bye": True} and 6 not in out


def test_droplet_writes_a_script_and_a_saved_droplet_file(tmp_path):
    drop = tmp_path / "soft.fvdrop"
    r = cli("droplet", "Soft", "--format", "jpg", "--quality", "80", "--to", str(tmp_path / "out"), "--suffix", "_x", "--data", str(drop), "--out", str(tmp_path), "--name", "soft_drop")
    assert r.returncode == 0, r.stderr
    saved = json.loads(drop.read_text())
    assert saved["kind"] == "formvis-droplet" and saved["action"] == "Soft"
    assert saved["output"]["format"] == "jpg" and saved["output"]["quality"] == 80 and saved["output"]["suffix"] == "_x"
    script = (tmp_path / "soft_drop").read_text()
    assert script.startswith("#!/bin/sh") and "cli droplet" in script and str(drop) in script
    assert os.access(tmp_path / "soft_drop", os.X_OK) and (tmp_path / "soft_drop.cmd").exists()
