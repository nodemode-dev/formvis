import asyncio

import pytest

from app.routers import mcp as M
from app.services import agents


@pytest.mark.parametrize("name", ["export_image", "export_mask", "export_layer"])
def test_every_export_that_writes_a_file_asks(name):
    why = asyncio.run(M._risk(name, {"path": "/tmp/formvis-test/out.png"}))
    assert why and "Undo cannot restore" in why


def test_an_ordinary_edit_does_not_ask():
    assert asyncio.run(M._risk("set_layer", {"id": "L1", "opacity": 0.5})) is None
