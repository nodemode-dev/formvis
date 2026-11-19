import asyncio
import os

os.environ["FORMVIS_OPEN_WINDOW"] = "0"

import httpx  # noqa: E402

from app.main import app  # noqa: E402
from app.core import window_key  # noqa: E402
from app.routers import mcp as M  # noqa: E402
from app.services import agents  # noqa: E402

WINDOW = {window_key.HEADER: window_key.KEY}
BASE = "http://127.0.0.1:8190"


def meta(name):
    return {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": {"name": name, "version": "1"}, "io.modelcontextprotocol/clientCapabilities": {}}


def call(c, name, **kw):
    return c.post("/mcp", json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"_meta": meta(name), "name": "get_document", "arguments": {}}}, **kw)


def fresh(monkeypatch):
    M._pending.clear(); M._ready = None; M._allowed = False; M._declined_until = 0.0; M._declined.clear(); M._questions.clear(); M._seen = 0.0; M._opened_at = 0.0
    monkeypatch.setattr(agents, "_loaded", True)
    monkeypatch.setattr(agents, "_save", lambda: None)
    monkeypatch.setattr(agents, "_policies", {})
    monkeypatch.setattr(agents, "_stored", {"allowed": None, "blocked": False})
    monkeypatch.setattr(agents, "_enabled", True)


def text(result):
    return result["content"][0]["text"]


def test_always_allow_is_one_agents_and_a_deny_is_that_agents_own(monkeypatch):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE, headers=WINDOW) as c:
            fresh(monkeypatch)
            agents.set_policy("one", "allow")
            seen = []

            async def window(n):
                while len(seen) < n:
                    r = await c.get("/api/mcp/bridge/next?allowed=0")
                    if r.status_code != 200:
                        continue
                    item = r.json()
                    seen.append((item["name"], item["arguments"].get("client"), item.get("once")))
                    result = {"allowed": False} if item["name"] == "__consent__" else {"content": [{"type": "text", "text": "ran"}]}
                    await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": result})

            w = asyncio.create_task(window(2))
            await asyncio.sleep(0.05)
            one = (await call(c, "one")).json()["result"]
            two = (await call(c, "two")).json()["result"]
            await w
            again = (await call(c, "two")).json()["result"]
            w = asyncio.create_task(window(3))
            await asyncio.sleep(0.05)
            three = (await call(c, "three")).json()["result"]
            await w
            return seen, one, two, again, three
    seen, one, two, again, three = asyncio.run(run())
    assert seen == [("get_document", None, True), ("__consent__", "two", None), ("__consent__", "three", None)]
    assert text(one) == "ran" and not one.get("isError") and M._allowed is False
    assert two["isError"] and "did not allow" in text(two)
    assert again["isError"] and "just now" in text(again)
    assert three["isError"] and "did not allow" in text(three)


def test_blocked_refuses_every_agent_with_no_window_open(monkeypatch):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE, headers=WINDOW) as c:
            fresh(monkeypatch)
            state = (await c.post("/api/agents/blocked", json={"blocked": True})).json()
            outside = (await call(c, "one")).json()["result"]
            token = agents.issue_inapp()
            own = (await call(c, "x", headers={"x-formvis-inapp": token})).json()["result"]
            agents.revoke_inapp(token)
            back = (await c.post("/api/agents/blocked", json={"blocked": False})).json()
            return state, outside, own, back
    state, outside, own, back = asyncio.run(run())
    assert state["blocked"] is True and back["blocked"] is False
    assert outside["isError"] and "blocked in formvis" in text(outside)
    assert own["isError"] and "blocked in formvis" in text(own)


def test_a_waiting_question_is_listed_until_it_is_answered(monkeypatch):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE, headers=WINDOW) as c:
            fresh(monkeypatch)
            first = asyncio.create_task(c.get("/api/mcp/bridge/next?allowed=0"))
            await asyncio.sleep(0.05)
            pending = asyncio.create_task(call(c, "one"))
            item = (await first).json()
            listed = (await c.get("/api/mcp/bridge/questions")).json()["questions"]
            await c.post("/api/mcp/bridge/result", json={"id": item["id"], "result": {"allowed": False}})
            await pending
            after = (await c.get("/api/mcp/bridge/questions")).json()["questions"]
            return item, listed, after
    item, listed, after = asyncio.run(run())
    assert item["name"] == "__consent__" and item["arguments"]["wait"] == 180
    assert [(q["id"], q["client"], q["tool"]) for q in listed] == [(item["id"], "one", "get_document")]
    assert 0 < listed[0]["wait"] <= 180 and after == []


def test_the_question_list_and_the_blocked_setting_need_the_window_key():
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE) as c:
            return (await c.get("/api/mcp/bridge/questions")).status_code, (await c.post("/api/agents/blocked", json={"blocked": True})).status_code
    assert asyncio.run(run()) == (403, 403)
