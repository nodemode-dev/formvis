"""The engine's compute device (Phase 18.6): which ONNX Runtime execution provider the engine's models run on.

Automatic takes CUDA where ONNX Runtime has it (an NVIDIA GPU with the CUDA build), else Core ML (Metal, on a Mac), else
the CPU. A chosen device that is not available falls back to the CPU and says why. The CPU is always the last provider
in the list, so a model the GPU provider cannot run part of still runs.
"""

from __future__ import annotations

DEVICES = ("auto", "metal", "cuda", "cpu")
PROVIDER = {"cuda": "CUDAExecutionProvider", "metal": "CoreMLExecutionProvider", "cpu": "CPUExecutionProvider"}
LABEL = {"cuda": "CUDA", "metal": "Metal (Core ML)", "cpu": "CPU"}

_preference = "auto"


def available_providers() -> list[str]:
    """The execution providers this ONNX Runtime build offers, or none without ONNX Runtime."""
    try:
        import onnxruntime

        return list(onnxruntime.get_available_providers())
    except Exception:  # not installed, or a broken build: the engine's models cannot run at all
        return []


def choose(preference: str, available: list[str]) -> dict:
    """The device for `preference` given the providers ONNX Runtime offers: the device, the providers to pass to a session
    (the CPU last), and the reason, as the engine reports it."""
    has = {device for device, provider in PROVIDER.items() if provider in available}
    if preference == "auto":
        device = "cuda" if "cuda" in has else "metal" if "metal" in has else "cpu"
        reason = f"Automatic: {LABEL[device]}" + ("" if device != "cpu" else ", as ONNX Runtime here has no CUDA or Core ML provider")
    elif preference in ("cuda", "metal") and preference not in has:
        device = "cpu"
        reason = f"{LABEL[preference]} is chosen, but ONNX Runtime here has no {PROVIDER[preference]}, so the engine uses the CPU"
    else:
        device = preference if preference in PROVIDER else "cpu"
        reason = f"{LABEL[device]} is chosen"
    providers = [PROVIDER[device]] + ([] if device == "cpu" else [PROVIDER["cpu"]])
    return {"preference": preference, "device": device, "label": LABEL[device], "providers": providers, "available": available, "reason": reason}


def current() -> dict:
    return choose(_preference, available_providers())


def set_preference(preference: str) -> dict:
    """Set the preference; model sessions made for the old device are dropped, so the next one uses the new device."""
    global _preference
    if preference not in DEVICES:
        raise ValueError(f"unknown device: {preference}")
    if preference != _preference:
        _preference = preference
        from app.services import background, segment

        background.clear_sessions()
        segment.clear()
    return current()
