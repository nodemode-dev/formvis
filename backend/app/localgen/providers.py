"""Keys the local generation code asks for (a Civitai key, to fetch a LoRA): from formvis's key store or the
environment, never shown."""

import os

from app.services import secrets


def key_for(name: str) -> str | None:
    env = os.environ.get(f"{name.upper()}_API_KEY") or os.environ.get(f"{name.upper()}_KEY")
    if env:
        return env
    return secrets.get(name, lambda: None, lambda: None)


# The providers the generation catalogue names: fal, with formvis's own key (secrets "fal", or FAL_KEY) and its
# address (FORMVIS_FAL_BASE, as formvis's fal service reads it).
PROVIDERS = {"fal": {"label": "fal", "env": "FAL_KEY", "base_env": "FORMVIS_FAL_BASE", "base": "https://fal.run", "purpose": "generate"}}


def base_for(name: str) -> str:
    spec = PROVIDERS[name]
    return os.environ.get(spec["base_env"], "").strip().rstrip("/") or spec["base"]
