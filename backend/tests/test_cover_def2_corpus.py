# PC-IO-0206: ./formvis corpus DIR opens every picture through the engine decoder, lists what fails, honours
# expected-failures.txt, exits 1 when a file is not as expected, and writes its report (here into a scratch folder, never the repo).
import importlib.util
import io
import json
import os
from pathlib import Path

from PIL import Image


def load_corpus(tmp_path, client):
    repo = Path(os.environ.get("FORMVIS_REPO", Path(__file__).resolve().parents[2]))
    spec = importlib.util.spec_from_file_location("corpus_under_test", repo / "setup" / "corpus.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.ROOT = tmp_path / "out"
    mod.ROOT.mkdir()

    def post(engine, name, data):
        r = client.post("/api/io/decode", files={"file": (name, data, "application/octet-stream")})
        return r.status_code, r.content

    mod.post = post
    return mod


def png(w=7, h=5):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (10, 200, 30)).save(buf, "PNG")
    return buf.getvalue()


def run(mod, folder, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["corpus", str(folder)])
    code = mod.main()
    return code, capsys.readouterr().out


def test_corpus_reports_each_file_and_exits_zero_when_all_are_as_expected(client, tmp_path, monkeypatch, capsys):
    mod = load_corpus(tmp_path, client)
    folder = tmp_path / "pics"
    folder.mkdir()
    (folder / "good.png").write_bytes(png())
    (folder / "broken.png").write_bytes(b"not a picture")
    (folder / "expected-failures.txt").write_text("broken.png\n")
    code, out = run(mod, folder, monkeypatch, capsys)
    assert code == 0
    assert "ok   good.png" in out and "7x5" in out
    assert "FAIL broken.png" in out and "2 files, 1 opened, 0 not as expected" in out
    report = next((tmp_path / "out" / "bench-results").glob("corpus-*.json"))
    rows = {r["file"]: r for r in json.loads(report.read_text())["files"]}
    assert rows["good.png"]["opened"] is True and (rows["good.png"]["width"], rows["good.png"]["height"]) == (7, 5)
    assert rows["broken.png"]["opened"] is False and rows["broken.png"]["expected"] is True


def test_corpus_exits_one_when_a_file_that_should_open_does_not(client, tmp_path, monkeypatch, capsys):
    mod = load_corpus(tmp_path, client)
    folder = tmp_path / "pics"
    folder.mkdir()
    (folder / "good.png").write_bytes(png())
    (folder / "broken.png").write_bytes(b"not a picture")
    code, out = run(mod, folder, monkeypatch, capsys)
    assert code == 1 and "1 not as expected" in out
