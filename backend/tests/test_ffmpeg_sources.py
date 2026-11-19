import hashlib
import io
import tarfile

import pytest

from app import ffmpeg_fetch as ff


def _archive(name: str, payload: bytes) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as bundle:
        info = tarfile.TarInfo(f"pkg/{name}")
        info.size = len(payload)
        info.mode = 0o755
        bundle.addfile(info, io.BytesIO(payload))
    return buf.getvalue()


def test_the_new_address_comes_first_and_the_old_one_second(monkeypatch):
    monkeypatch.delenv("FORMCUT_FFMPEG_RELEASE", raising=False)
    urls = ff.sources()
    assert [u.split("/releases/")[0] for u in urls] == ["https://github.com/nodemode-dev/formai-binaries", "https://github.com/nodemode-dev/formcut-binaries"]
    assert all(u.endswith(f"/ffmpeg-{ff.RELEASE}/ffmpeg-lgpl-{ff.RELEASE}-{ff.host_triple()}.tar.gz") for u in urls)


def test_the_override_is_the_only_source(monkeypatch):
    monkeypatch.setenv("FORMCUT_FFMPEG_RELEASE", "https://mirror.example/ffmpeg")
    assert ff.sources() == [f"https://mirror.example/ffmpeg/ffmpeg-lgpl-{ff.RELEASE}-{ff.host_triple()}.tar.gz"]


@pytest.fixture()
def fake_release(tmp_path, monkeypatch):
    name = f"ffmpeg-{ff.host_triple()}"
    good = b"#!/bin/sh\necho ffmpeg\n"
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "share"))
    monkeypatch.delenv("FORMCUT_FFMPEG_RELEASE", raising=False)
    monkeypatch.setattr(ff, "FILES", {ff.host_triple(): ((name, hashlib.sha256(good).hexdigest()),)})
    monkeypatch.setattr(ff, "SOURCES", ("https://new.example", "https://old.example"))
    served: dict[str, bytes] = {}
    asked: list[str] = []

    def download(url, target):
        asked.append(url.split("/")[2])
        if url.split("/")[2] not in served:
            raise OSError("404")
        target.write_bytes(served[url.split("/")[2]])

    monkeypatch.setattr(ff, "_download", download)
    return name, good, served, asked


def test_bytes_that_do_not_match_on_the_first_address_fall_back_to_the_second(fake_release):
    name, good, served, asked = fake_release
    served["new.example"] = _archive(name, b"other bytes")
    served["old.example"] = _archive(name, good)
    where = ff.fetch()
    assert asked == ["new.example", "old.example"] and (where / name).read_bytes() == good


def test_nothing_is_installed_when_no_address_matches(fake_release):
    name, _good, served, asked = fake_release
    served["new.example"] = _archive(name, b"one")
    served["old.example"] = _archive(name, b"two")
    with pytest.raises(ValueError):
        ff.fetch()
    assert asked == ["new.example", "old.example"] and not (ff.folder() / name).exists()
