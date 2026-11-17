from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import selection_models

router = APIRouter(tags=["selection-models"])


class ChoiceBody(BaseModel):
    kind: selection_models.Kind
    choice: selection_models.Choice


@router.get("/selection-models")
def get_selection_models() -> dict:
    return selection_models.report()


@router.put("/selection-models")
def put_selection_models(body: ChoiceBody) -> dict:
    try:
        selection_models.set_preference(body.kind, body.choice)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="The choice could not be saved in the data folder.") from exc
    return selection_models.report()
