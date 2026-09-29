"""formcut's event channel is not here: formvis's window asks for a job's state instead. publish is kept as a no-op
so the jobs taken from formcut run unchanged."""


def publish(kind: str, **fields) -> None:
    return None
