"""Prompt improvement (1.51.5): the language model's settings, its models, and improving a prompt."""

from fastapi import APIRouter, Form, HTTPException
from starlette.concurrency import run_in_threadpool

from app.services import llm

router = APIRouter(prefix="/api/llm", tags=["llm"])


def _run(fn, *args):
    try:
        return fn(*args)
    except llm.LlmError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.get("/status")
def status() -> dict:
    return llm.status()


@router.post("/settings")
def settings(base_url: str = Form(...), model: str = Form(...), key: str | None = Form(None), forget_key: bool = Form(False)) -> dict:
    return _run(llm.save, base_url, model, key, forget_key)


@router.get("/models")
async def models() -> dict:
    return {"models": await run_in_threadpool(_run, llm.models)}


@router.post("/improve")
async def improve(prompt: str = Form(...), instructions: str = Form("")) -> dict:
    return {"prompt": await run_in_threadpool(_run, llm.improve, prompt, instructions)}
