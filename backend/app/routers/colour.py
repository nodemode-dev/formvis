"""Colour management routes (1.53.5, H2): profiles, adding one, and colour lookup tables."""

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.services import colour

router = APIRouter(tags=["colour"])


class LutRequest(BaseModel):
    source: dict | None = None
    dest: dict | None = None
    proof: dict | None = None
    intent: str = "relative"
    bpc: bool = True
    proofIntent: str = "relative"
    gamut: bool = False


@router.get("/profiles")
def list_profiles() -> dict:
    return {"profiles": colour.profiles(), "folder": str(colour.profile_dirs()[0])}


@router.post("/profiles")
def add_profile(file: UploadFile = File(...)) -> dict:
    try:
        return colour.add(file.file.read(colour.MAX_BYTES + 1), file.filename or "profile.icc")
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/describe")
def describe_profile(file: UploadFile = File(...)) -> dict:
    try:
        return colour.describe(file.file.read(colour.MAX_BYTES + 1))
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/lut")
def build_lut(req: LutRequest) -> Response:
    try:
        data = colour.lut(req.source, req.dest, req.proof, req.intent, req.bpc, req.proofIntent, req.gamut)
    except colour.ColourError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(data, media_type="application/octet-stream", headers={"X-Grid": str(colour.GRID), "X-Gamut": "1" if req.gamut and req.proof else "0"})


@router.get("/profiles/{pid}")
def profile_bytes(pid: str) -> Response:
    try:
        return Response(colour._find(pid), media_type="application/vnd.iccprofile")
    except colour.ColourError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
