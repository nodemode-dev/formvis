"""Window > Agent Connect (DEV_PLAN 28.4): the master switch, each agent's policy, the steps waiting for approval, the
activity feed and Stop, over HTTP, and the live feed over a WebSocket (the state and the log so far, then changes). The
same local-origin rule as the terminals."""

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.routers.terminal import origin_ok, require_local
from app.services import agents

router = APIRouter(prefix="/api/agents", tags=["agents"])


class EnabledBody(BaseModel):
    enabled: bool


class PolicyBody(BaseModel):
    client: str = Field(min_length=1, max_length=80)
    policy: str = Field(max_length=20)


class ApproveBody(BaseModel):
    id: str = Field(max_length=40)
    allow: bool


class StopBody(BaseModel):
    client: str | None = Field(None, max_length=80)


class LimitsBody(BaseModel):
    roots: list[str] | None = Field(None, max_length=32)
    text_chars: int | None = None
    image_bytes: int | None = None


@router.get("/limits")
def read_limits(request: Request) -> dict:
    require_local(request)
    return agents.limits()


@router.post("/limits")
async def write_limits(body: LimitsBody, request: Request) -> dict:
    require_local(request)
    try:
        return agents.set_limits(body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("")
def read(request: Request) -> dict:
    require_local(request)
    return agents.state() | {"activity": agents.activity()}


@router.get("/tool-policies")
def tool_policies(request: Request, client: str = "assistant") -> dict:
    require_local(request)
    return {"client": client, "policies": agents.tool_policies(client)}


@router.get("/activity")
def feed(request: Request, limit: int = 100) -> list[dict]:
    require_local(request)
    return agents.activity(max(1, min(limit, agents.LOG_LIMIT)))


@router.post("/enabled")
async def enable(body: EnabledBody, request: Request) -> dict:
    require_local(request)
    agents.set_enabled(body.enabled)
    return agents.state()


@router.post("/policy")
async def policy(body: PolicyBody, request: Request) -> dict:
    require_local(request)
    try:
        agents.set_policy(body.client, body.policy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return agents.state()


@router.post("/approve")
async def approve(body: ApproveBody, request: Request) -> dict:
    require_local(request)
    if not agents.decide(body.id, body.allow):
        raise HTTPException(status_code=404, detail="That step is no longer waiting: it was answered, stopped or timed out.")
    return agents.state()


@router.post("/stop")
async def stop(body: StopBody, request: Request) -> dict:
    require_local(request)
    return {"stopped": agents.stop(body.client)} | agents.state()


@router.websocket("/stream")
async def stream(ws: WebSocket) -> None:
    if not origin_ok(ws.headers.get("origin"), ws.headers.get("host")):
        await ws.close(code=4403)
        return
    await ws.accept()
    queue = agents.subscribe()

    async def outbound() -> None:
        await ws.send_text(json.dumps({"type": "state", **agents.state(), "activity": agents.activity()}))
        while True:
            await ws.send_text(json.dumps(await queue.get()))

    sender = asyncio.create_task(outbound())
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        agents.unsubscribe(queue)
