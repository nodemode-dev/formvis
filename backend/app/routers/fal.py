from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services import fal_run
from app.services.generative import GenerativeError

router = APIRouter(tags=["fal"])


class RunBody(BaseModel):
    model: str
    inputs: dict = Field(default_factory=dict)
    images: dict = Field(default_factory=dict)


@router.get("/models")
def models() -> dict:
    return fal_run.listing()


@router.post("/run")
async def run(body: RunBody) -> dict:
    try:
        return await run_in_threadpool(fal_run.run, body.model, body.inputs, body.images)
    except GenerativeError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
